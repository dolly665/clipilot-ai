import { PLATFORM_KEYS, PLATFORMS, type PlatformKey } from "./platforms";
import type { ContentType, Orient, SourceKind } from "./types";

/**
 * 音频配 B roll 合成视频推迟到第一阶段之后；在那之前音频只发播客和长文。
 * 做好后把它改成 true，音频就会出现视频平台。
 */
export const AUDIO_TO_VIDEO_READY = false;

/** 这种素材可以发到哪些平台（UI 里列出来供勾选） */
export function availablePlatforms(kind: SourceKind, orient: Orient): PlatformKey[] {
  if (kind === "text") return ["gzh", "zhihu", "gzhp", "xhsn", "wb", "ytc"];
  if (kind === "audio") {
    return AUDIO_TO_VIDEO_READY ? ["xyz", "xmly", "pod", "bili", "sph", "yt", "gzh", "zhihu"] : ["xyz", "xmly", "pod", "gzh", "zhihu"];
  }
  // 视频：画幅匹配的视频平台 + 由视频派生的长文/播客；知乎只接横屏派生
  return PLATFORM_KEYS.filter((k) => {
    const p = PLATFORMS[k];
    if (p.format === "post") return false;
    if (k === "zhihu" && orient !== "h") return false;
    if (p.format === "video") return (p.orients as readonly Orient[]).includes(orient);
    return orient === "h";
  });
}

const VIDEO_DEFAULTS: Record<Orient, PlatformKey[]> = {
  h: ["bili", "sph", "yt", "gzh", "xyz", "xmly"],
  v: ["dy", "xhs", "sph", "yts"],
};

/** 默认勾选哪些平台（HANDOFF §4）。不考虑合规，合规在 compliance.ts 里另算。 */
export function defaultPlatforms(kind: SourceKind, orient: Orient, type: ContentType): PlatformKey[] {
  let list: PlatformKey[];
  if (kind === "text") list = ["gzh", "zhihu", "gzhp", "xhsn", "wb", "ytc"];
  else if (kind === "audio") {
    const avail = availablePlatforms("audio", orient);
    list = (["xyz", "xmly", "bili", "sph", "yt", "gzh"] as PlatformKey[]).filter((k) => avail.includes(k));
  }
  else list = [...VIDEO_DEFAULTS[orient]];

  if (type === "screen") list = list.filter((k) => PLATFORMS[k].format !== "podcast");
  if (type === "vlog") list = list.filter((k) => PLATFORMS[k].format === "video");
  return list;
}
