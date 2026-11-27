import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cleanTranscriptExport } from "./clean";
import { scorePolish, similarity } from "./score";

const raw = cleanTranscriptExport(readFileSync("templates/voice/samples/xiuxing.raw.txt", "utf8")).text;
const approved = readFileSync("templates/voice/samples/xiuxing.approved.txt", "utf8");

describe("scorePolish", () => {
  it("认可版和自己比相似度是 1，原文和认可版明显更低", () => {
    expect(similarity(approved, approved)).toBe(1);
    expect(similarity(raw, approved)).toBeLessThan(0.8);
  });
  it("能看出原文段落太长、混进了工具内容", () => {
    const s = scorePolish(readFileSync("templates/voice/samples/xiuxing.raw.txt", "utf8"), approved, raw);
    expect(s["混进转写工具内容"]!.结果).toBe("有");
    expect(Number(s["平均每段字数"]!.结果)).toBeGreaterThan(Number(s["平均每段字数"]!.认可版) * 2);
  });
});
