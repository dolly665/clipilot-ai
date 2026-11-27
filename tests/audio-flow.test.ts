import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { createFakeAsr } from "@/server/asr/fake";
import { makeTone, probe } from "@/server/media/ffmpeg";
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

async function upload(seconds = 45) {
  const tmp = path.join(db.dir, "tmp", `${Math.random()}.mp3`);
  await makeTone(tmp, seconds);
  return svc.createMedia({ name: "边界感.mp3", tempPath: tmp });
}

describe("音频链路：上传 → 识别 → 粗剪 → 预填 → 生成 → 审核", () => {
  it("走完全程，原文件不变", async () => {
    const created = await upload();
    const original = path.join(db.dir, created.filePath);
    const before = fs.readFileSync(original);
    expect(fs.statSync(original).mode & 0o222).toBe(0);

    const s = await svc.processAudio(created.id);
    expect(s.error).toBeNull();
    expect(s.status).toBe("prefilled");
    expect(s.stage).toBeNull();
    const d = readDraft(s);
    expect(s.type).toBe("audio");
    expect(d.platforms.sort()).toEqual(["gzh", "xmly", "xyz"]);

    const rc = readRoughCut(s)!;
    expect(rc.level).toBe("standard");
    expect(new Set(rc.cuts.map((c) => c.reason)).size).toBe(4);
    expect(rc.rendered?.version).toBe(rc.version);
    const preview = path.join(db.dir, rc.rendered!.path);
    expect((await probe(preview)).duration).toBeLessThan(s.durationSec! - 2);

    await svc.startGenerate(s.id);
    const g = await svc.generate(s.id);
    expect(g.error).toBeNull();
    expect(g.status).toBe("review");
    const ders = await db.prisma.derivative.findMany({ where: { sourceId: s.id } });
    expect(ders.map((x) => x.kind).sort()).toEqual(["longform", "podcast", "zhihu_article", "zhihu_idea"]);
    const pod = ders.find((x) => x.kind === "podcast")!;
    expect(fs.existsSync(path.join(db.dir, pod.filePath!))).toBe(true);
    expect(JSON.stringify(pod.content)).toContain("时间轴");

    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.map((j) => j.platform).sort()).toEqual(["gzh", "xmly", "xyz"]);
    expect(jobs.find((j) => j.platform === "xyz")?.derivativeId).toBe(pod.id);

    expect(fs.readFileSync(original).equals(before)).toBe(true);
  });

  it("恢复一刀后重新渲染，试听变长", async () => {
    const s = await svc.processAudio((await upload()).id);
    const rc = readRoughCut(s)!;
    const pause = rc.cuts.find((c) => c.reason === "pause" && c.end - c.start > 0.3)!;
    const toggled = await svc.toggleCut(s.id, pause.id);
    expect(readRoughCut(toggled)!.version).toBe(rc.version + 1);
    const r = await svc.renderRoughCut(s.id);
    const rc2 = readRoughCut(r)!;
    expect(rc2.rendered!.version).toBe(rc2.version);
    expect(rc2.rendered!.duration - rc.rendered!.duration).toBeCloseTo(pause.end - pause.start, 1);
    // 再点一次 = 重新剪掉
    expect(readRoughCut(await svc.toggleCut(s.id, pause.id))!.restored).toEqual([]);
  });

  it("换成紧凑档：刀更多，之前的恢复清空", async () => {
    const s = await svc.processAudio((await upload()).id);
    const n = readRoughCut(s)!.cuts.length;
    const t = await svc.setCutLevel(s.id, "tight");
    expect(readRoughCut(t)!.cuts.length).toBeGreaterThan(n);
    expect(readRoughCut(t)!.restored).toEqual([]);
    const c = await svc.setCutLevel(s.id, "conservative");
    expect(readRoughCut(c)!.cuts.length).toBeLessThan(n);
  });

  it("开始生成后不能再改粗剪", async () => {
    const s = await svc.processAudio((await upload()).id);
    await svc.startGenerate(s.id);
    await expect(svc.setCutLevel(s.id, "tight")).rejects.toThrow();
  });

  it("语音识别失败时标记失败并说明原因", async () => {
    const bad = sourceService({
      db: db.prisma, provider: createFakeProvider(), root: db.dir,
      asr: { name: "x", transcribe: async () => { throw new Error("识别服务不可用"); } },
    });
    const tmp = path.join(db.dir, "tmp", "bad.mp3");
    await makeTone(tmp, 5);
    const s = await bad.processAudio((await bad.createMedia({ name: "a.mp3", tempPath: tmp })).id);
    expect(s.status).toBe("failed");
    expect(s.error).toContain("识别服务不可用");
  });

  it("没有声音的文件拒绝", async () => {
    const tmp = path.join(db.dir, "tmp", "empty.txt");
    fs.mkdirSync(path.dirname(tmp), { recursive: true });
    fs.writeFileSync(tmp, "not audio");
    await expect(svc.createMedia({ name: "x.mp3", tempPath: tmp })).rejects.toThrow();
  });
});
