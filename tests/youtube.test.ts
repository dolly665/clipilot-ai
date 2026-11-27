import fs from "node:fs";
import path from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { createFakeAsr } from "@/server/asr/fake";
import { makeTestVideo } from "@/server/media/ffmpeg";
import { writeCredential } from "@/server/publish/credentials";
import { publishYoutubeJob, youtubeAuthUrl, youtubeConnect, youtubeSnippet, youtubeStatus } from "@/server/publish/youtube";
import { seed } from "@/server/seed";
import { sourceService } from "@/server/sources";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let svc: ReturnType<typeof sourceService>;
beforeAll(async () => {
  db = makeTestDb();
  await seed(db.prisma);
  svc = sourceService({ db: db.prisma, provider: createFakeProvider(), asr: createFakeAsr(), root: db.dir });
  vi.stubEnv("YOUTUBE_CLIENT_ID", "cid");
  vi.stubEnv("YOUTUBE_CLIENT_SECRET", "secret");
});
afterAll(async () => { vi.unstubAllEnvs(); await db.cleanup(); });
afterEach(() => vi.unstubAllGlobals());

type Call = { url: string; method: string; headers: Record<string, string>; body?: unknown };

/** 假的 Google：记下每次请求，按地址回不同结果 */
function fakeGoogle(opts: { thumbnailFails?: boolean } = {}) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) => {
    calls.push({ url, method: init.method ?? "GET", headers: init.headers ?? {}, body: init.body });
    if (url.includes("oauth2.googleapis.com/token")) return Response.json({ access_token: "at", refresh_token: "rt" });
    if (url.includes("/channels")) return Response.json({ items: [{ id: "UC1", snippet: { title: "时予清" } }] });
    if (url.includes("/videos?uploadType=resumable")) return new Response(null, { status: 200, headers: { location: "https://upload.example/session1" } });
    if (url === "https://upload.example/session1") return Response.json({ id: "VID123" });
    if (url.includes("/captions")) return Response.json({ id: "cap" });
    if (url.includes("/thumbnails/set")) return opts.thumbnailFails ? Response.json({ error: { message: "The authenticated user doesn't have permissions" } }, { status: 403 }) : Response.json({});
    return new Response("unexpected", { status: 500 });
  }));
  return calls;
}

async function approvedVideo(size: string) {
  const tmp = path.join(db.dir, "tmp", `${Math.random()}.mp4`);
  await makeTestVideo(tmp, 20, size);
  const s = await svc.processAudio((await svc.createMedia({ name: "v.mp4", tempPath: tmp })).id);
  await svc.startGenerate(s.id);
  await svc.generate(s.id);
  const at = new Date(Date.now() + 6 * 3600_000);
  await svc.approve(s.id, at);
  return { s, at };
}

describe("YouTube 授权", () => {
  it("授权地址要离线权限；连接后存刷新令牌和频道名", async () => {
    const u = new URL(youtubeAuthUrl("st"));
    expect(u.searchParams.get("access_type")).toBe("offline");
    expect(u.searchParams.get("scope")).toContain("youtube.upload");
    expect(u.searchParams.get("redirect_uri")).toBe("http://localhost:3000/api/connect/youtube/callback");
    fakeGoogle();
    await youtubeConnect("code", db.dir);
    expect(await youtubeStatus(db.dir)).toMatchObject({ connected: true, channelTitle: "时予清" });
    const cred = path.join(db.dir, "credentials", "youtube.json");
    expect(fs.statSync(cred).mode & 0o077).toBe(0);
  });
});

describe("YouTube 上传", () => {
  it("横屏：传无字幕成片 + SRT + 封面，定时公开，返回链接", { timeout: 120_000 }, async () => {
    await writeCredential("youtube", { refreshToken: "rt", connectedAt: "" }, db.dir);
    const { s, at } = await approvedVideo("320x180");
    const job = await db.prisma.publishJob.findFirstOrThrow({ where: { sourceId: s.id, platform: "yt" } });
    // 封面：模拟页面上点了「设为发布封面」
    const cover = await db.prisma.derivative.findFirstOrThrow({ where: { sourceId: s.id, kind: "cover" } });
    const rel = `derivatives/${s.id}/cover/cover.jpg`;
    fs.copyFileSync(path.join(db.dir, (cover.content as { frames: string[] }).frames[0]!), path.join(db.dir, rel));
    await db.prisma.derivative.update({ where: { id: cover.id }, data: { content: { ...(cover.content as object), png: rel } } });

    const calls = fakeGoogle({ thumbnailFails: true });
    const r = await publishYoutubeJob(db.prisma, job.id, { root: db.dir });
    expect(r.url).toBe("https://www.youtube.com/watch?v=VID123");

    const init = calls.find((c) => c.url.includes("uploadType=resumable"))!;
    const meta = JSON.parse(init.body as string) as { snippet: { title: string; defaultLanguage: string }; status: { privacyStatus: string; publishAt: string } };
    expect(meta.status).toMatchObject({ privacyStatus: "private", publishAt: at.toISOString() });
    expect(meta.snippet.defaultLanguage).toBe("zh-Hans");
    const clean = await db.prisma.derivative.findMany({ where: { sourceId: s.id, kind: "video" } });
    const cleanFile = clean.find((d) => (d.content as { variant: string }).variant === "clean")!.filePath!;
    expect(Number(init.headers["X-Upload-Content-Length"])).toBe(fs.statSync(path.join(db.dir, cleanFile)).size);
    expect(calls.some((c) => c.url.includes("/captions"))).toBe(true);
    // 封面失败只是提醒，不算整条失败
    expect(r.warnings.join()).toContain("封面没设上");
  });

  it("Shorts：传字幕烧进画面的版本，标题带 #Shorts，不另传字幕", { timeout: 120_000 }, async () => {
    await writeCredential("youtube", { refreshToken: "rt", connectedAt: "" }, db.dir);
    const { s } = await approvedVideo("180x320");
    const job = await db.prisma.publishJob.findFirstOrThrow({ where: { sourceId: s.id, platform: "yts" } });
    const calls = fakeGoogle();
    const r = await publishYoutubeJob(db.prisma, job.id, { root: db.dir });
    expect(r.url).toBe("https://www.youtube.com/shorts/VID123");
    const meta = JSON.parse(calls.find((c) => c.url.includes("uploadType=resumable"))!.body as string) as { snippet: { title: string } };
    expect(meta.snippet.title).toMatch(/#Shorts$/);
    expect(calls.some((c) => c.url.includes("/captions"))).toBe(false);
  });

  it("没批准的任务不传", { timeout: 120_000 }, async () => {
    const tmp = path.join(db.dir, "tmp", "x.mp4");
    await makeTestVideo(tmp, 10, "320x180");
    const s = await svc.processAudio((await svc.createMedia({ name: "x.mp4", tempPath: tmp })).id);
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const job = await db.prisma.publishJob.findFirstOrThrow({ where: { sourceId: s.id, platform: "yt" } });
    await expect(publishYoutubeJob(db.prisma, job.id, { root: db.dir })).rejects.toThrow("已批准");
  });

  it("标题、简介、标签按 YouTube 的限制截断", () => {
    const sn = youtubeSnippet({ title: "<长>".repeat(80), description: "字".repeat(3000), tags: Array.from({ length: 100 }, (_, i) => `标签${i}`) });
    expect([...sn.title].length).toBeLessThanOrEqual(100);
    expect(sn.title).not.toMatch(/[<>]/);
    expect(Buffer.byteLength(sn.description)).toBeLessThanOrEqual(5000);
    expect(sn.tags.join(",").length).toBeLessThanOrEqual(500);
  });
});

describe("接进发布执行器", () => {
  it("批准后马上上传（不等排期），状态变已发布并写入链接", { timeout: 120_000 }, async () => {
    const { publishRunner } = await import("@/server/publish/runner");
    const { youtubeConnectors } = await import("@/server/publish/youtube");
    vi.stubEnv("DATA_DIR", db.dir);
    await writeCredential("youtube", { refreshToken: "rt", connectedAt: "" }, db.dir);
    const { s } = await approvedVideo("320x180");
    fakeGoogle();
    const runner = publishRunner(db.prisma, youtubeConnectors);
    const results = await runner.runDue(new Date());
    const mine = results.filter((r) => r.platform === "yt");
    expect(mine.length).toBeGreaterThan(0);
    const job = await db.prisma.publishJob.findFirstOrThrow({ where: { sourceId: s.id, platform: "yt" } });
    expect(job).toMatchObject({ status: "published", url: "https://www.youtube.com/watch?v=VID123" });
    // 其他平台没有连接器，保持已批准，等你手动发
    expect((await db.prisma.publishJob.findFirstOrThrow({ where: { sourceId: s.id, platform: "bili" } })).status).toBe("approved");
  });
});
