import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { UnderstandSchema } from "./schemas";
import { AiError, providerFromEnv, runTask } from "./index";
import { loadPrompt, promptVersions, render } from "./prompts";
import { layoutLongform, shortPosts, understand, zhihu } from "./tasks";
import type { AiProvider } from "./types";

const SAMPLE = "关系里的边界感：怎么拒绝才不伤人\n\n很多人不敢拒绝，是怕关系变差。\n\n其实清楚的边界，反而让关系更长久。\n\n最后说一个小练习。";

describe("prompts", () => {
  it("每个任务都有 v1，且能读出 system / user", () => {
    for (const name of ["understand", "longform", "zhihu", "short-posts"]) {
      expect(promptVersions(name)).toContain(1);
      const p = loadPrompt(name);
      expect(p.system.length).toBeGreaterThan(10);
      expect(p.user.length).toBeGreaterThan(10);
    }
  });
  it("默认取最新版本", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prompts-"));
    fs.mkdirSync(path.join(dir, "t"));
    for (const v of [1, 2, 10]) fs.writeFileSync(path.join(dir, "t", `v${v}.md`), `## system\ns${v}\n## user\nu${v}`);
    expect(loadPrompt("t", { dir })).toMatchObject({ version: 10, system: "s10", user: "u10" });
    expect(loadPrompt("t", { dir, version: 2 }).user).toBe("u2");
  });
  it("缺变量时报错", () => {
    expect(() => render("你好 {{name}}", {})).toThrow(/name/);
  });
});

describe("providerFromEnv", () => {
  it("默认 fake", () => expect(providerFromEnv({}).name).toBe("fake"));
  it("真实提供方必须配置模型名", () => {
    expect(() => providerFromEnv({ AI_PROVIDER: "anthropic" })).toThrow(AiError);
    expect(providerFromEnv({ AI_PROVIDER: "anthropic", AI_MODEL: "x" }).model).toBe("x");
  });
  it("不认识的提供方报错", () => expect(() => providerFromEnv({ AI_PROVIDER: "nope", AI_MODEL: "x" })).toThrow(AiError));
});

describe("runTask", () => {
  it("格式不对时重试一次，并把错误告诉模型", async () => {
    const calls: string[] = [];
    const provider: AiProvider = {
      name: "stub",
      model: "stub",
      async complete(req) {
        calls.push(req.user);
        return calls.length === 1
          ? "不是 JSON"
          : JSON.stringify({ title: "t", titleAlts: ["a", "b"], type: "text", topic: "生活", reasons: { title: "", type: "", topic: "" } });
      },
    };
    const r = await runTask("understand", { kind: "text", text: "x", types: "", topics: "" }, UnderstandSchema, { provider });
    expect(r.data.title).toBe("t");
    expect(r.prompt).toEqual({ name: "understand", version: 1 });
    expect(calls[1]).toContain("上一次的输出不符合要求");
  });
  it("两次都失败则报 AiError", async () => {
    const provider: AiProvider = { name: "stub", model: "stub", complete: async () => '{"title":1}' };
    await expect(runTask("understand", { kind: "text", text: "x", types: "", topics: "" }, UnderstandSchema, { provider })).rejects.toThrow(AiError);
  });
});

describe("tasks（fake 提供方）", () => {
  it("预填：标题、2 个备选、主题", async () => {
    const r = await understand({ kind: "text", text: SAMPLE });
    expect(r.data.title).toContain("边界感");
    expect(r.data.titleAlts).toHaveLength(2);
    expect(r.data.topic).toBe("心理学");
    expect(r.data.type).toBe("text");
  });
  it("长文：原文段落逐字保留", async () => {
    const r = await layoutLongform({ text: SAMPLE, title: "边界感", topic: "心理学" });
    const paras = r.data.blocks.filter((b) => b.type === "paragraph").map((b) => b.text);
    expect(paras.join("\n\n")).toBe(SAMPLE);
    expect(r.data.blocks.some((b) => b.type === "heading")).toBe(true);
    expect(r.prompt.name).toBe("longform");
  });
  it("知乎和短帖", async () => {
    const z = await zhihu({ text: SAMPLE, title: "边界感", topic: "心理学" });
    expect(z.data.question).toMatch(/？$/);
    const s = await shortPosts({ text: SAMPLE, title: "边界感", topic: "心理学" });
    expect(s.data.wb.text.length).toBeLessThanOrEqual(140);
  });
});

describe("polish v2", () => {
  it("默认用最新版 v2，带上同音错字表，保留语气词的要求在提示词里", async () => {
    const { loadGlossary } = await import("./tasks");
    const g = loadGlossary();
    expect(g).toContain("称 → 嗔");
    expect(g).not.toContain("听错 → 应为");
    const p = loadPrompt("polish");
    expect(p.version).toBe(2);
    expect(render(p.system, { glossary: g })).toContain("阿耨多罗三藐三菩提");
    expect(p.system).toContain("「就是」");
  });
});
