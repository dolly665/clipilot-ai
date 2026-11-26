import type { Orient, Region } from "./types";

export type PlatformFormat = "video" | "longform" | "post" | "podcast";
export type PublishMethod = "api" | "rss" | "browser" | "draft";

export type Platform = {
  name: string;
  region: Region;
  format: PlatformFormat;
  /** 视频平台接受的画幅；非视频平台不看画幅 */
  orients: readonly Orient[];
  method: PublishMethod;
  /** 以后再定，暂不可选 */
  tbd?: boolean;
};

export const METHOD_LABEL: Record<PublishMethod, string> = {
  api: "API 全自动",
  rss: "RSS 自动同步",
  browser: "浏览器半自动",
  draft: "草稿箱 + 你点发布",
};

export const FORMAT_LABEL: Record<PlatformFormat, string> = {
  video: "视频",
  longform: "长文",
  post: "图文",
  podcast: "播客",
};

/** 平台表，与 design/qingqing-mockup.html 和 HANDOFF §4 保持一致 */
export const PLATFORMS = {
  bili: { name: "B站", region: "cn", format: "video", orients: ["h", "v"], method: "browser" },
  sph: { name: "视频号", region: "cn", format: "video", orients: ["h", "v"], method: "browser" },
  dy: { name: "抖音", region: "cn", format: "video", orients: ["v"], method: "browser" },
  xhs: { name: "小红书", region: "cn", format: "video", orients: ["v", "h"], method: "browser" },
  gzh: { name: "公众号", region: "cn", format: "longform", orients: ["h", "v"], method: "draft" },
  zhihu: { name: "知乎", region: "cn", format: "longform", orients: ["h", "v"], method: "browser" },
  gzhp: { name: "公众号贴图", region: "cn", format: "post", orients: ["h", "v"], method: "draft" },
  xhsn: { name: "小红书图文", region: "cn", format: "post", orients: ["h", "v"], method: "browser" },
  wb: { name: "微博", region: "cn", format: "post", orients: ["h", "v"], method: "browser" },
  xyz: { name: "小宇宙", region: "cn", format: "podcast", orients: ["h", "v"], method: "rss" },
  xmly: { name: "喜马拉雅", region: "cn", format: "podcast", orients: ["h", "v"], method: "rss" },
  yt: { name: "YouTube", region: "os", format: "video", orients: ["h"], method: "api" },
  yts: { name: "YouTube Shorts", region: "os", format: "video", orients: ["v"], method: "api" },
  ytc: { name: "YouTube 社区帖", region: "os", format: "post", orients: ["h", "v"], method: "browser" },
  pod: { name: "海外播客", region: "os", format: "podcast", orients: ["h", "v"], method: "rss", tbd: true },
} as const satisfies Record<string, Platform>;

export type PlatformKey = keyof typeof PLATFORMS;
export const PLATFORM_KEYS = Object.keys(PLATFORMS) as PlatformKey[];

export function platform(key: PlatformKey): Platform {
  return PLATFORMS[key];
}

export function isPlatformKey(x: string): x is PlatformKey {
  return x in PLATFORMS;
}
