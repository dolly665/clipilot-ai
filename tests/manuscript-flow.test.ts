import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { splitForPolish } from "@/domain/chunk";
import type { DerivativeContent } from "@/domain/derivatives";
import type { AiProvider } from "@/server/ai";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { polishText } from "@/server/ai/tasks";
import { seed } from "@/server/seed";
import { sourceService } from "@/server/sources";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let svc: ReturnType<typeof sourceService>;
beforeAll(async () => {
  db = makeTestDb();
  await seed(db.prisma);
  svc = sourceService({ db: db.prisma, provider: createFakeProvider(), root: db.dir });
});
afterAll(async () => { await db.cleanup(); });

const SPOKEN = "嗯今天我想跟大家聊聊那个边界感然后就是说很多人不敢拒绝是怕关系变差其实其实清楚的边界反而让关系更长久我自己以前也是这样后来慢慢学会了说不";
const WRITTEN = "关系里的边界感\n\n很多人不敢拒绝，是怕关系变差。\n\n其实清楚的边界，反而让关系更长久。";

async function processed(text: string) {
  const s = await svc.createText({ name: "a.txt", text });
  return svc.processText(s.id);
}

describe("底稿：判断 → 润色 / 原样 → 编辑 → 确认", () => {
  it("录音转写稿：判为润色，出 AI 底稿，原文不变", async () => {
    const s = await processed(SPOKEN);
    expect(s.status).toBe("drafting");
    expect(s.textMode).toBe("polish");
    expect(s.textModeReason).toBeTruthy();
    expect(s.text).toBe(SPOKEN);
    const m = await svc.latestManuscript(s.id);
    expect(m).toMatchObject({ version: 1, origin: "ai", templateKey: "polish", templateVersion: 4 });
    expect(m!.body).not.toContain("嗯");
  });

  it("成稿：判为只排版，底稿就是原文", async () => {
    const s = await processed(WRITTEN);
    expect(s.textMode).toBe("layout");
    const m = await svc.latestManuscript(s.id);
    expect(m).toMatchObject({ origin: "original", body: WRITTEN });
  });

  it("手动切换处理方式、手改底稿、回到旧版本，每步都留版本", async () => {
    const s = await processed(WRITTEN);
    await svc.requestRedraft(s.id, "polish");
    const r = await svc.runRedraft(s.id);
    expect(r.status).toBe("drafting");
    expect(r.textMode).toBe("polish");
    expect(r.textModeEdited).toBe(true);
    expect((await svc.latestManuscript(s.id))!.version).toBe(2);

    await svc.saveManuscript(s.id, "我自己改的底稿。");
    expect((await svc.latestManuscript(s.id))).toMatchObject({ version: 3, origin: "user", body: "我自己改的底稿。" });
    // 内容没变不重复存
    await svc.saveManuscript(s.id, "我自己改的底稿。");
    expect((await svc.latestManuscript(s.id))!.version).toBe(3);

    await svc.restoreManuscript(s.id, 1);
    expect((await svc.latestManuscript(s.id))).toMatchObject({ version: 4, body: WRITTEN });
    expect(await db.prisma.manuscript.count({ where: { sourceId: s.id } })).toBe(4);
  });

  it("确认后用底稿预填和生成；短帖带图卡", async () => {
    const s = await processed(WRITTEN);
    await svc.saveManuscript(s.id, "我改过的底稿：边界感让关系更长久。\n\n先说感谢，再说难处，最后给替代方案。");
    await svc.confirmManuscript(s.id);
    const p = await svc.prefill(s.id);
    expect(p.status).toBe("prefilled");
    expect(p.stage).toBeNull();
    expect(p.title).toContain("我改过的底稿");
    await svc.startGenerate(s.id);
    await svc.generate(s.id);
    const lf = await db.prisma.derivative.findFirstOrThrow({ where: { sourceId: s.id, kind: "longform" } });
    expect(JSON.stringify(lf.content)).toContain("先说感谢，再说难处");
    expect(JSON.stringify(lf.content)).not.toContain("很多人不敢拒绝");
    const xhsn = await db.prisma.derivative.findFirstOrThrow({ where: { sourceId: s.id, platform: "xhsn" } });
    const c = xhsn.content as unknown as DerivativeContent;
    expect(c.kind === "post" && c.cover?.title && c.cards && c.cards.length > 0).toBe(true);
  });

  it("底稿里的敏感词决定国内拦截（原文有、底稿删掉了就不拦）", async () => {
    const s = await processed("小时候怕鬼。\n\n后来学会了一个人睡。");
    expect((s.hits as unknown[]).length).toBe(1);
    await svc.saveManuscript(s.id, "小时候怕黑。\n\n后来学会了一个人睡。");
    const after = await db.prisma.source.findUniqueOrThrow({ where: { id: s.id } });
    expect(after.hits).toEqual([]);
  });

  it("确认后不能再改底稿", async () => {
    const s = await processed(WRITTEN);
    await svc.confirmManuscript(s.id);
    await expect(svc.saveManuscript(s.id, "x")).rejects.toThrow(/待确认/);
  });
});

describe("polishText", () => {
  it("长文分块，块与块之间带上下文", async () => {
    const seen: string[] = [];
    const fake = createFakeProvider();
    const provider: AiProvider = { name: "s", model: "s", complete: async (r) => { seen.push(r.user); return fake.complete(r); } };
    const long = Array.from({ length: 30 }, (_, i) => `这是第${i}段，讲了一些事情，`.repeat(12) + "。").join("\n");
    const r = await polishText(long, { provider });
    expect(seen.length).toBe(splitForPolish(long).length);
    expect(seen.length).toBeGreaterThan(1);
    expect(seen[1]).toContain("上一部分（已理顺）结尾是");
    expect(r.text.length).toBeGreaterThan(0);
  });

  it("删得太多时给出提醒", async () => {
    const provider: AiProvider = { name: "s", model: "s", complete: async () => "只剩一句。" };
    const r = await polishText("很长的一段话，".repeat(40), { provider });
    expect(r.warnings[0]).toMatch(/删减较多/);
  });
});

describe("splitForPolish", () => {
  it("没有标点的超长段落也能切开，且不丢字", () => {
    const s = "字".repeat(6000);
    const chunks = splitForPolish(s, 2500);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(s);
  });
  it("短文不切", () => {
    expect(splitForPolish("一段。\n两段。")).toEqual(["一段。\n两段。"]);
  });
});
