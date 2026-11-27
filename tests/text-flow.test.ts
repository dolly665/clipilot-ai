import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeProvider } from "@/server/ai/providers/fake";
import type { AiProvider } from "@/server/ai";
import { seed } from "@/server/seed";
import { defaultScheduleTime, readDraft, sourceService } from "@/server/sources";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let svc: ReturnType<typeof sourceService>;
beforeAll(async () => {
  db = makeTestDb();
  await seed(db.prisma);
  svc = sourceService({ db: db.prisma, provider: createFakeProvider(), root: db.dir });
});
afterAll(async () => { await db.cleanup(); });

const TEXT = "关系里的边界感：怎么拒绝才不伤人\n\n很多人不敢拒绝，是怕关系变差。\n\n其实清楚的边界，反而让关系更长久。\n\n最后说一个小练习。";

async function prefilled(text = TEXT) {
  const s = await svc.createText({ name: "边界感.md", text });
  return svc.prefill(s.id);
}

describe("文本链路：上传 → 预填 → 生成 → 审核 → 批准", () => {
  it("原文存为只读文件，内容不变", async () => {
    const s = await svc.createText({ name: "a.md", text: TEXT });
    const abs = path.join(db.dir, s.filePath);
    expect(fs.readFileSync(abs, "utf8")).toBe(TEXT);
    expect(fs.statSync(abs).mode & 0o222).toBe(0);
  });

  it("走完全程", async () => {
    const s = await prefilled();
    expect(s.status).toBe("prefilled");
    const d = readDraft(s);
    expect(d.title).toContain("边界感");
    expect(d.topic).toBe("心理学");
    expect(d.regions).toEqual(["cn", "os"]);
    expect(d.platforms.sort()).toEqual(["gzh", "gzhp", "wb", "xhsn", "ytc", "zhihu"].sort());

    await svc.startGenerate(s.id);
    const g = await svc.generate(s.id);
    expect(g.status).toBe("review");

    const ders = await db.prisma.derivative.findMany({ where: { sourceId: s.id } });
    expect(ders.map((x) => x.kind).sort()).toEqual(["longform", "post", "post", "post", "post", "zhihu_article", "zhihu_idea"].sort());
    expect(ders.every((x) => x.templateKey && (x.templateVersion ?? 0) >= 1)).toBe(true);
    expect(ders.find((x) => x.platform === "xhsn")?.templateVersion).toBe(3);

    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs).toHaveLength(6);
    expect(jobs.every((j) => j.status === "pending_review" && j.derivativeId)).toBe(true);

    const n = await svc.approve(s.id, defaultScheduleTime());
    expect(n).toBe(6);
    const after = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(after.every((j) => j.status === "approved" && j.scheduledAt)).toBe(true);
    // 批准不等于发布：没有任何任务进入上传或已发布
    expect(after.some((j) => ["uploading", "published"].includes(j.status))).toBe(false);
  });

  it("没有批准前不能重复批准，也不能在生成前批准", async () => {
    const s = await prefilled();
    await expect(svc.approve(s.id, new Date())).rejects.toThrow(/待审核/);
  });
});

describe("合规", () => {
  it("原文有敏感词：预填只勾海外，国内任务全部拦截", async () => {
    const s = await prefilled("小时候怕鬼的那些夜晚。\n\n后来我学会了一个人睡。");
    expect(readDraft(s).regions).toEqual(["os"]);
    expect(JSON.parse(JSON.stringify(s.hits))[0].word).toBe("鬼");
    expect(readDraft(s).topic).toBe("生活");
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.find((j) => j.platform === "ytc")?.status).toBe("pending_review");
    const cn = jobs.filter((j) => j.platform !== "ytc");
    expect(cn.length).toBe(5);
    expect(cn.every((j) => j.status === "compliance_blocked" && j.blockReason === "sensitive")).toBe(true);
    await svc.approve(s.id, new Date());
    const after = await db.prisma.publishJob.findMany({ where: { sourceId: s.id, status: "compliance_blocked" } });
    expect(after).toHaveLength(5); // 批准不会放行被拦截的任务
  });

  it("改成只发海外的主题：区域强制为海外，即使再勾国内也无效", async () => {
    const s = await prefilled();
    const u = await svc.updateDraft(s.id, { topic: "修行" });
    expect(readDraft(u).regions).toEqual(["os"]);
    const u2 = await svc.updateDraft(s.id, { regions: ["cn", "os"] });
    expect(readDraft(u2).regions).toEqual(["os"]);
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.filter((j) => j.status === "pending_review").map((j) => j.platform)).toEqual(["ytc"]);
    expect(jobs.filter((j) => j.blockReason === "topic")).toHaveLength(5);
  });

  it("生成的文字里冒出敏感词：国内平台拦截，换一版干净的就恢复", async () => {
    let dirty = true;
    const fake = createFakeProvider();
    const provider: AiProvider = {
      name: "stub",
      model: "stub",
      async complete(req) {
        const out = await fake.complete(req);
        if (req.task !== "short-posts" || !dirty) return out;
        const o = JSON.parse(out);
        o.wb.text = "顺便说说风水";
        return JSON.stringify(o);
      },
    };
    const s2 = sourceService({ db: db.prisma, provider, root: db.dir });
    const s = await s2.prefill((await s2.createText({ name: "b.md", text: TEXT })).id);
    await s2.startGenerate(s.id);
    await s2.generate(s.id);
    let jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.filter((j) => j.status === "compliance_blocked")).toHaveLength(5);

    dirty = false;
    const wb = await db.prisma.derivative.findFirstOrThrow({ where: { sourceId: s.id, platform: "wb" } });
    await s2.regenerate(wb.id);
    jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.every((j) => j.status === "pending_review")).toBe(true);
  });
});

describe("发布信息", () => {
  it("记录用户改过的字段，可以恢复 AI 预填", async () => {
    const s = await prefilled();
    const u = await svc.updateDraft(s.id, { title: "我自己起的标题", platforms: ["gzh"] });
    expect(readDraft(u).title).toBe("我自己起的标题");
    expect(u.edited).toEqual(["title", "platforms"]);
    const r = await svc.restorePrefill(s.id);
    expect(readDraft(r).title).toBe(readDraft(s).title);
    expect(r.edited).toEqual([]);
  });

  it("没勾选的平台不建发布任务", async () => {
    const s = await prefilled();
    await svc.updateDraft(s.id, { platforms: ["gzh", "wb"] });
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const jobs = await db.prisma.publishJob.findMany({ where: { sourceId: s.id } });
    expect(jobs.map((j) => j.platform).sort()).toEqual(["gzh", "wb"]);
  });

  it("开始生成后不能再改发布信息", async () => {
    const s = await prefilled();
    await svc.startGenerate(s.id);
    await expect(svc.updateDraft(s.id, { title: "x" })).rejects.toThrow();
  });

  it("AI 出错时标记失败并记下原因", async () => {
    const provider: AiProvider = { name: "stub", model: "stub", complete: async () => { throw new Error("网络断了"); } };
    const s3 = sourceService({ db: db.prisma, provider, root: db.dir });
    const s = await s3.prefill((await s3.createText({ name: "c.md", text: TEXT })).id);
    expect(s.status).toBe("failed");
    expect(s.error).toContain("网络断了");
  });
});

describe("defaultScheduleTime", () => {
  it("今晚 20:00，过了就明晚", () => {
    const morning = new Date(2026, 10, 26, 9, 0);
    expect(defaultScheduleTime(morning)).toEqual(new Date(2026, 10, 26, 20, 0));
    const night = new Date(2026, 10, 26, 21, 0);
    expect(defaultScheduleTime(night)).toEqual(new Date(2026, 10, 27, 20, 0));
  });
});
