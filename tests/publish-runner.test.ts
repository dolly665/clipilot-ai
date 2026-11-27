import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { publishRunner } from "@/server/publish/runner";
import type { PublishConnector } from "@/server/publish/types";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let sourceId: string;
beforeAll(async () => {
  db = makeTestDb();
  const s = await db.prisma.source.create({ data: { kind: "text", status: "approved", originalName: "a.txt", filePath: "a.txt", mimeType: "text/plain" } });
  sourceId = s.id;
});
afterAll(async () => { await db.cleanup(); });
beforeEach(async () => { await db.prisma.publishJob.deleteMany(); });

const NOW = new Date("2026-11-27T12:00:00Z");
const LATER = new Date("2026-11-27T20:00:00Z");
const calls: string[] = [];
const ok = (platform: string, uploadEarly = false): PublishConnector => ({
  platform: platform as never,
  uploadEarly,
  async publish(_db, jobId) { calls.push(jobId); return { url: `https://example.com/${platform}`, warnings: [] }; },
});
const broken: PublishConnector = { platform: "yt" as never, async publish() { throw new Error("YouTube 授权过期了，请到「平台与规则」重新连接"); } };

async function job(platform: string, status: string, scheduledAt: Date | null = NOW) {
  return db.prisma.publishJob.create({ data: { sourceId, platform, status, scheduledAt } });
}

describe("发布执行器", () => {
  it("只发已批准、到时间、有连接器的任务", async () => {
    calls.length = 0;
    const due = await job("yt", "approved", NOW);
    const notYet = await job("bili", "approved", LATER);
    const noConnector = await job("dy", "approved", NOW);
    const blocked = await job("gzh", "compliance_blocked", NOW);
    const r = publishRunner(db.prisma, [ok("yt"), ok("bili"), ok("gzh")]);
    const res = await r.runDue(NOW);
    expect(res.map((x) => x.jobId)).toEqual([due.id]);
    expect(calls).toEqual([due.id]);
    const after = await db.prisma.publishJob.findUnique({ where: { id: due.id } });
    expect(after).toMatchObject({ status: "published", url: "https://example.com/yt" });
    for (const id of [notYet.id, noConnector.id]) expect((await db.prisma.publishJob.findUnique({ where: { id } }))!.status).toBe("approved");
    expect((await db.prisma.publishJob.findUnique({ where: { id: blocked.id } }))!.status).toBe("compliance_blocked");
  });

  it("没批准的任务，强制也不会发", async () => {
    const j = await job("yt", "pending_review");
    const r = publishRunner(db.prisma, [ok("yt")]);
    expect((await r.runJob(j.id, { force: true })).status).toBe("skipped");
    expect((await db.prisma.publishJob.findUnique({ where: { id: j.id } }))!.status).toBe("pending_review");
  });

  it("uploadEarly 的平台批准后马上上传，不等排期", async () => {
    const j = await job("yt", "approved", LATER);
    const res = await publishRunner(db.prisma, [ok("yt", true)]).runDue(NOW);
    expect(res[0]).toMatchObject({ jobId: j.id, status: "published" });
  });

  it("失败时写清原因并提示可以手动发；重试回到已批准", async () => {
    const j = await job("yt", "approved");
    const r = publishRunner(db.prisma, [broken]);
    const res = await r.runJob(j.id, { now: NOW });
    expect(res.status).toBe("failed");
    const failed = await db.prisma.publishJob.findUnique({ where: { id: j.id } });
    expect(failed!.status).toBe("failed");
    expect(failed!.error).toContain("授权过期");
    expect(failed!.error).toContain("手动发布");
    await r.retry(j.id);
    expect((await db.prisma.publishJob.findUnique({ where: { id: j.id } }))).toMatchObject({ status: "approved", error: null });
  });

  it("同一个任务不会被发两次", async () => {
    calls.length = 0;
    const j = await job("yt", "approved");
    const r = publishRunner(db.prisma, [ok("yt")]);
    const [a, b] = await Promise.all([r.runJob(j.id, { now: NOW }), r.runJob(j.id, { now: NOW })]);
    expect([a.status, b.status].sort()).toEqual(["published", "skipped"]);
    expect(calls).toEqual([j.id]);
  });

  it("手动发布：记成已发布，链接要像个链接", async () => {
    const j = await job("dy", "approved");
    const r = publishRunner(db.prisma, []);
    await expect(r.markManual(j.id, "douyin.com/x")).rejects.toThrow("http");
    await r.markManual(j.id, "https://www.douyin.com/video/1");
    expect(await db.prisma.publishJob.findUnique({ where: { id: j.id } })).toMatchObject({ status: "published", url: "https://www.douyin.com/video/1" });
    const pending = await job("bili", "pending_review");
    await expect(r.markManual(pending.id)).rejects.toThrow();
  });
});
