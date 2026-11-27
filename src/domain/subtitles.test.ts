import { describe, expect, it } from "vitest";
import { buildCues, toSrt } from "./subtitles";
import { normalizeTranscript, type Word } from "./transcript";

function t(chars: string, step = 0.25) {
  const words: Word[] = [...chars].map((c, i) => ({ text: c, start: i * step, end: i * step + step * 0.8 }));
  return normalizeTranscript({ duration: chars.length * step, words, sentences: [] });
}

describe("字幕", () => {
  it("竖屏一行不超过 12 个字，行尾不带标点", () => {
    const cues = buildCues(t("今天想跟大家聊聊边界感，很多人不敢拒绝是怕关系变差。"), "v");
    expect(cues.length).toBeGreaterThan(1);
    for (const c of cues) {
      expect([...c.text].length).toBeLessThanOrEqual(12);
      expect(c.text).not.toMatch(/[，。]$/);
    }
    expect(cues.map((c) => c.text.replace(/ /g, "")).join("")).toBe("今天想跟大家聊聊边界感很多人不敢拒绝是怕关系变差");
  });

  it("横屏行更宽；时间不重叠", () => {
    const cues = buildCues(t("今天想跟大家聊聊边界感很多人不敢拒绝是怕关系变差其实清楚的边界反而让关系更长久"), "h");
    for (const c of cues) expect([...c.text].length).toBeLessThanOrEqual(18);
    for (let i = 1; i < cues.length; i++) expect(cues[i]!.start).toBeGreaterThanOrEqual(cues[i - 1]!.end);
  });

  it("SRT 格式", () => {
    expect(toSrt([{ start: 1.5, end: 3725.25, text: "你好" }])).toBe("1\n00:00:01,500 --> 01:02:05,250\n你好\n");
  });
});
