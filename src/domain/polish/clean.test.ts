import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanTranscriptExport } from "./clean";

describe("cleanTranscriptExport", () => {
  it("去掉开头摘要、免责声明、说话人时间行", () => {
    const raw = readFileSync("templates/voice/samples/xiuxing.raw.txt", "utf8");
    const { text, removed } = cleanTranscriptExport(raw);
    expect(text.startsWith("再回到一个很入门的时候")).toBe(true);
    expect(text).not.toMatch(/说话人|AI大模型生成|00:00/);
    expect(removed).toHaveLength(3);
    expect(text.endsWith("最后的正行。")).toBe(true);
  });

  it("多个说话人、没有摘要时只去掉说话人行", () => {
    const { text } = cleanTranscriptExport("说话人1 00:00:01\n你好。\n说话人2 01:02:03\n你也好。");
    expect(text).toBe("你好。\n你也好。");
  });

  it("普通文本原样返回", () => {
    const t = "第一段。\n\n第二段，提到 10:30 开会。";
    expect(cleanTranscriptExport(t).text).toBe(t);
  });
});
