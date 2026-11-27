import { describe, expect, it } from "vitest";
import { makeTranscript } from "../../tests/helpers/transcript";
import { cutStats, detectCuts, keepSegments, mapTime, remapTranscript, totalLength } from "./roughcut";
import { formatTime, transcriptText } from "./transcript";

const reasons = (spec: string, level: "conservative" | "standard" | "tight" = "standard") =>
  detectCuts(makeTranscript(spec), level).map((c) => `${c.reason}:${c.text ?? ""}`);

describe("detectCuts", () => {
  it("长停顿：标准档剪，两边留余量", () => {
    const t = makeTranscript("大家好/今天聊聊。");
    const cuts = detectCuts(t, "standard");
    expect(cuts).toHaveLength(1);
    expect(cuts[0]).toMatchObject({ reason: "pause", start: 0.85, end: 1.35 });
  });

  it("停顿阈值随档位变化", () => {
    const spec = "大家好_今天_聊聊。"; // 0.2 秒小停顿
    expect(reasons(spec, "tight").filter((r) => r.startsWith("pause"))).toHaveLength(0);
    const t = makeTranscript("大家好__今天。"); // 0.4 秒
    expect(detectCuts(t, "tight").filter((c) => c.reason === "pause")).toHaveLength(0);
    const t2 = makeTranscript("大家好___今天。"); // 0.6 秒
    expect(detectCuts(t2, "tight").filter((c) => c.reason === "pause")).toHaveLength(1);
    expect(detectCuts(t2, "standard").filter((c) => c.reason === "pause")).toHaveLength(0);
  });

  it("开头和结尾的空白也剪", () => {
    const t = makeTranscript("//大家好。", { tail: 3 });
    const cuts = detectCuts(t, "standard");
    expect(cuts[0]).toMatchObject({ start: 0 });
    expect(cuts.at(-1)!.end).toBe(t.duration);
  });

  it("嗯、呃任何档位都剪", () => {
    expect(reasons("我觉得嗯这个问题。", "conservative")).toContain("filler:嗯");
  });

  it("「啊」只有单独出现时才剪，「好啊」里的不剪", () => {
    expect(reasons("好啊我们开始。")).not.toContain("filler:啊");
    expect(reasons("我们_啊_开始。")).toContain("filler:啊");
  });

  it("多字口头禅「那个」作为一个词", () => {
    expect(reasons("我们_[那个]_开始吧。")).toContain("filler:那个");
  });

  it("重复：剪掉前一遍", () => {
    const t = makeTranscript("我们我们开始吧。");
    const c = detectCuts(t, "standard").find((x) => x.reason === "repeat")!;
    expect(c).toMatchObject({ text: "我们", start: 0, end: 0.4 });
  });

  it("单字叠词（谢谢）不当成重复；紧凑档里中间有停顿的单字重复才剪", () => {
    expect(reasons("谢谢大家。", "tight").some((r) => r.startsWith("repeat"))).toBe(false);
    expect(reasons("我_我觉得。", "tight")).toContain("repeat:我");
    expect(reasons("我_我觉得。", "standard").some((r) => r.startsWith("repeat"))).toBe(false);
  });

  it("说错重来：下一句以同样开头重说，剪掉前一句", () => {
    const t = makeTranscript("今天我们来聊一下。今天我们来聊一聊边界感。");
    const c = detectCuts(t, "standard").find((x) => x.reason === "retake")!;
    expect(c.text).toBe("今天我们来聊一下。");
    expect(c.start).toBe(0);
    expect(c.end).toBe(t.sentences[1]!.start);
  });

  it("正常的两句不会误判为重来", () => {
    expect(reasons("今天天气不错。明天我们去爬山。").some((r) => r.startsWith("retake"))).toBe(false);
  });

  it("被「说错重来」包住的小刀不重复计数", () => {
    const cuts = detectCuts(makeTranscript("今天我们嗯来聊。今天我们来聊边界感。"), "standard");
    expect(cuts.filter((c) => c.reason === "filler")).toHaveLength(0);
    expect(cuts.filter((c) => c.reason === "retake")).toHaveLength(1);
  });

  it("刀的 id 稳定，同一输入两次结果一致", () => {
    const t = makeTranscript("大家好/嗯我们我们开始。");
    expect(detectCuts(t, "standard")).toEqual(detectCuts(t, "standard"));
  });
});

describe("keepSegments / 恢复", () => {
  const t = makeTranscript("大家好/嗯我们开始。");
  const cuts = detectCuts(t, "standard");

  it("保留片段是剪刀的补集", () => {
    const keep = keepSegments(t.duration, cuts);
    const removed = t.duration - totalLength(keep);
    expect(removed).toBeCloseTo(cuts.reduce((n, c) => n + c.end - c.start, 0), 1);
  });

  it("恢复某一刀后这一段重新保留", () => {
    const filler = cuts.find((c) => c.reason === "filler")!;
    const before = totalLength(keepSegments(t.duration, cuts));
    const after = totalLength(keepSegments(t.duration, cuts, [filler.id]));
    expect(after - before).toBeCloseTo(filler.end - filler.start, 2);
  });

  it("全部恢复 = 原片", () => {
    expect(keepSegments(t.duration, cuts, cuts.map((c) => c.id))).toEqual([{ start: 0, end: t.duration }]);
  });

  it("统计", () => {
    const s = cutStats(cuts, [], t.duration);
    expect(s.byReason.pause).toBe(1);
    expect(s.byReason.filler).toBe(1);
    expect(s.removed).toBeGreaterThan(0.5);
  });
});

describe("remapTranscript", () => {
  it("去掉被剪的词，时间对齐到成片", () => {
    const t = makeTranscript("大家好/嗯我们开始。");
    const keep = keepSegments(t.duration, detectCuts(t, "standard"));
    const r = remapTranscript(t, keep);
    expect(r.words.map((w) => w.text).join("")).toBe("大家好我们开始");
    expect(transcriptText(r)).toBe("大家好我们开始");
    expect(r.words.at(-1)!.end).toBeLessThanOrEqual(r.duration + 0.01);
    for (let i = 1; i < r.words.length; i++) expect(r.words[i]!.start).toBeGreaterThanOrEqual(r.words[i - 1]!.start);
  });

  it("没剪到的句子保留原来的标点", () => {
    const t = makeTranscript("大家好。今天聊聊。");
    const r = remapTranscript(t, keepSegments(t.duration, []));
    expect(transcriptText(r)).toBe("大家好。\n今天聊聊。");
  });

  it("mapTime", () => {
    const seg = [{ start: 0, end: 1 }, { start: 2, end: 3 }];
    expect(mapTime(seg, 0.5)).toBe(0.5);
    expect(mapTime(seg, 1.5)).toBeNull();
    expect(mapTime(seg, 2.5)).toBe(1.5);
  });
});

describe("formatTime", () => {
  it("分秒和时分秒", () => {
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3725)).toBe("1:02:05");
  });
});
