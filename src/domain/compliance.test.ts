import { describe, expect, it } from "vitest";
import { decidePlatforms, defaultRegions, DEFAULT_SENSITIVE_WORDS, scanSensitive } from "./compliance";
import { availablePlatforms, defaultPlatforms } from "./defaults";
import { PLATFORMS } from "./platforms";
import type { Topic } from "./types";

describe("scanSensitive", () => {
  it("返回每处命中的位置", () => {
    const text = "今天聊聊烧纸，再聊聊风水和烧纸。";
    const hits = scanSensitive(text, DEFAULT_SENSITIVE_WORDS);
    expect(hits.map((h) => h.word)).toEqual(["烧纸", "风水", "烧纸"]);
    for (const h of hits) expect(text.slice(h.start, h.end)).toBe(h.word);
  });
  it("长词优先，不重复报短词", () => {
    expect(scanSensitive("这是因果报应", ["因果", "因果报应"]).map((h) => h.word)).toEqual(["因果报应"]);
  });
  it("没有命中返回空", () => {
    expect(scanSensitive("用 Claude 搭一个自动发布工作流", DEFAULT_SENSITIVE_WORDS)).toEqual([]);
  });
  it("忽略空词和重复词", () => {
    expect(scanSensitive("鬼", ["", " ", "鬼", "鬼"])).toHaveLength(1);
  });
});

function decide(topic: Topic, hitsText = "") {
  const available = availablePlatforms("video", "h");
  const hits = scanSensitive(hitsText, DEFAULT_SENSITIVE_WORDS);
  return decidePlatforms({
    topic,
    regions: ["cn", "os"],
    selected: available, // 用户把所有平台都勾上，也不能绕过合规
    available,
    hits,
  });
}

describe("decidePlatforms", () => {
  it("修行 / 玄学·法界：所有国内平台拦截，即使用户勾选了", () => {
    for (const topic of ["修行", "玄学·法界"] as const) {
      for (const d of decide(topic)) {
        if (PLATFORMS[d.key].region === "cn") expect(d).toMatchObject({ state: "blocked", why: "topic" });
      }
      expect(decide(topic).find((d) => d.key === "yt")?.state).toBe("on");
    }
  });
  it("命中敏感词：国内平台拦截，海外照常", () => {
    const ds = decide("心理学", "聊聊烧纸");
    expect(ds.find((d) => d.key === "bili")).toMatchObject({ state: "blocked", why: "sensitive" });
    expect(ds.find((d) => d.key === "yt")?.state).toBe("on");
  });
  it("无问题的主题：按勾选和区域", () => {
    const available = availablePlatforms("video", "h");
    const ds = decidePlatforms({
      topic: "AI 实操",
      regions: ["cn"],
      selected: defaultPlatforms("video", "h", "talk"),
      available,
      hits: [],
    });
    expect(ds.find((d) => d.key === "bili")?.state).toBe("on");
    expect(ds.find((d) => d.key === "yt")).toMatchObject({ state: "off", why: "region_off" });
    expect(ds.find((d) => d.key === "xhs")).toMatchObject({ state: "off", why: "not_selected" });
  });
  it("「以后再定」的海外播客不可选", () => {
    const ds = decidePlatforms({ topic: "生活", regions: ["cn", "os"], selected: ["pod"], available: ["pod"], hits: [] });
    expect(ds[0]).toMatchObject({ state: "off", why: "tbd" });
  });
  it("改主题后国内平台自动关", () => {
    const before = decide("心理学").filter((d) => d.state === "on").map((d) => d.key);
    const after = decide("修行").filter((d) => d.state === "on").map((d) => d.key);
    expect(before).toContain("bili");
    expect(after).not.toContain("bili");
    expect(after.every((k) => PLATFORMS[k].region === "os")).toBe(true);
  });
});

describe("defaultRegions", () => {
  it("只发海外的主题或有敏感词时只勾海外", () => {
    expect(defaultRegions("修行", [])).toEqual(["os"]);
    expect(defaultRegions("生活", [{ word: "鬼", start: 0, end: 1 }])).toEqual(["os"]);
    expect(defaultRegions("生活", [])).toEqual(["cn", "os"]);
  });
});
