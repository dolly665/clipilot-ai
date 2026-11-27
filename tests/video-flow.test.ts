import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DerivativeContent } from "@/domain/derivatives";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { createFakeAsr } from "@/server/asr/fake";
import { makeTestVideo, probe } from "@/server/media/ffmpeg";
import { seed } from "@/server/seed";
import { readDraft, readRoughCut, sourceService } from "@/server/sources";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let svc: ReturnType<typeof sourceService>;
beforeAll(async () => {
  db = makeTestDb();
  await seed(db.prisma);
  svc = sourceService({ db: db.prisma, provider: createFakeProvider(), asr: createFakeAsr(), root: db.dir });
});
afterAll(async () => { await db.cleanup(); });

async function upload(size: string, seconds = 40) {
  const tmp = path.join(db.dir, "tmp", `${Math.random()}.mp4`);
  await makeTestVideo(tmp, seconds, size);
  return svc.createMedia({ name: "边界感.mp4", tempPath: tmp });
}

describe("视频链路：上传 → 识别 → 粗剪 → 预填 → 生成成片、字幕、封面、文案", () => {
  it("横屏：干净成片 + SRT（B站/YouTube）+ 烧字幕版（视频号）+ 长文和播客", { timeout: 120_000 }, async () => {
    const created = await upload("320x180");
    expect(created.kind).toBe("video");
    expect(created.orient).toBe("h");
    const original = path.join(db.dir, created.filePath);
    const before = fs.readFileSync(original);

    const s = await svc.processAudio(created.id);
    expect(s.error).toBeNull();
    expect(s.status).toBe("prefilled");
    expect(s.type).toBe("talk");
    expect(readDraft(s).platforms.sort()).toEqual(["bili", "gzh", "sph", "xmly", "xyz", "yt"]);

    await svc.startGenerate(s.id);
    const g = await svc.generate(s.id);
    expect(g.error).toBeNull();
    expect(g.status).toBe("review");

    const ders = await db.prisma.derivative.findMany({ where: { sourceId: s.id } });
    const of = (k: string) => ders.filter((d) => d.kind === k);
    const videos = of("video").map((d) => d.content as unknown as Extract<DerivativeContent, { kind: "video" }>);
    expect(videos.map((v) => v.variant).sort()).toEqual(["burned", "clean"]);
    const clean = of("video").find((d) => (d.content as { variant: string }).variant === "clean")!;
    const info = await probe(path.join(db.dir, clean.filePath!));
    expect(info.hasVideo && info.hasAudio).toBe(true);
    expect(info.duration).toBeLessThan(s.durationSec! - 2);
    expect(info.duration).toBeCloseTo(readRoughCut(g)!.rendered!.duration, 0);

    const srt = fs.readFileSync(path.join(db.dir, of("subtitle")[0]!.filePath!), "utf8");
    expect(srt).toMatch(/^1\n00:00:00,\d{3} --> /);
    expect(srt).toContain("边界");

    const cover = of("cover")[0]!.content as unknown as Extract<DerivativeContent, { kind: "cover" }>;
    expect(cover.frames).toHaveLength(3);
    for (const f of cover.frames) expect(fs.existsSync(path.join(db.dir, f))).toBe(true);

    expect(of("video_copy").map((d) => d.platform).sort()).toEqual(["bili", "sph", "yt"]);
    expect(of("podcast")).toHaveLength(1);
    expect(of("longform")).toHaveLength(1);

    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.map((j) => j.platform).sort()).toEqual(["bili", "gzh", "sph", "xmly", "xyz", "yt"]);
    expect(jobs.find((j) => j.platform === "bili")?.derivativeId).toBe(of("video_copy").find((d) => d.platform === "bili")!.id);

    expect(fs.readFileSync(original).equals(before)).toBe(true);
  });

  it("竖屏：只发视频平台，字幕烧进画面，不出长文和播客", { timeout: 120_000 }, async () => {
    const created = await upload("180x320");
    expect(created.orient).toBe("v");
    const s = await svc.processAudio(created.id);
    expect(readDraft(s).platforms.sort()).toEqual(["dy", "sph", "xhs", "yts"]);
    await svc.startGenerate(s.id);
    const g = await svc.generate(s.id);
    expect(g.error).toBeNull();
    const kinds = (await db.prisma.derivative.findMany({ where: { sourceId: s.id } })).map((d) => d.kind);
    expect(kinds.filter((k) => k === "video")).toHaveLength(2);
    expect(kinds).not.toContain("longform");
    expect(kinds).not.toContain("podcast");
  });

  it("单个平台文案可以重新生成，成片不行", { timeout: 120_000 }, async () => {
    const s = await svc.processAudio((await upload("320x180", 20)).id);
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const ders = await db.prisma.derivative.findMany({ where: { sourceId: s.id } });
    const copy = ders.find((d) => d.kind === "video_copy")!;
    const r = await svc.regenerate(copy.id);
    expect((r.content as { kind: string }).kind).toBe("video_copy");
    await expect(svc.regenerate(ders.find((d) => d.kind === "video")!.id)).rejects.toThrow("不能单独重新生成");
  });
});
