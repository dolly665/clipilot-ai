import { describe, expect, it } from "vitest";
import { availablePlatforms, defaultPlatforms } from "./defaults";

describe("defaultPlatforms", () => {
  it("横屏视频：B站、视频号、YouTube + 公众号、小宇宙、喜马拉雅", () => {
    expect(defaultPlatforms("video", "h", "talk").sort()).toEqual(["bili", "gzh", "sph", "xmly", "xyz", "yt"].sort());
  });
  it("竖屏视频：抖音、小红书、视频号、YouTube Shorts", () => {
    expect(defaultPlatforms("video", "v", "talk").sort()).toEqual(["dy", "sph", "xhs", "yts"].sort());
  });
  it("录屏教学默认不发播客", () => {
    const l = defaultPlatforms("video", "h", "screen");
    expect(l).not.toContain("xyz");
    expect(l).not.toContain("xmly");
    expect(l).toContain("gzh");
  });
  it("Vlog 只发视频", () => {
    expect(defaultPlatforms("video", "h", "vlog").sort()).toEqual(["bili", "sph", "yt"].sort());
  });
  it("长文本：公众号、知乎 + 四个短帖平台", () => {
    expect(defaultPlatforms("text", "h", "text").sort()).toEqual(["gzh", "gzhp", "wb", "xhsn", "ytc", "zhihu"].sort());
  });
  it("默认选中的平台都在可选列表里", () => {
    for (const [kind, orient, type] of [["video", "h", "talk"], ["video", "v", "talk"], ["audio", "h", "audio"], ["text", "h", "text"]] as const) {
      const avail = availablePlatforms(kind, orient);
      for (const k of defaultPlatforms(kind, orient, type)) expect(avail).toContain(k);
    }
  });
});

describe("availablePlatforms", () => {
  it("竖屏视频不出现只收横屏的 YouTube、不派生长文", () => {
    const l = availablePlatforms("video", "v");
    expect(l).toContain("yts");
    expect(l).not.toContain("yt");
    expect(l).not.toContain("zhihu");
    expect(l).not.toContain("gzh");
  });
  it("视频不直接发图文短帖", () => {
    expect(availablePlatforms("video", "h")).not.toContain("wb");
  });
});
