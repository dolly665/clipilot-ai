import fs from "node:fs/promises";
import path from "node:path";
import type { DerivativeContent } from "@/domain/derivatives";
import { PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { buildCues, toSrt } from "@/domain/subtitles";
import type { Transcript } from "@/domain/transcript";
import type { Orient, Topic } from "@/domain/types";
import type { AiProvider } from "./ai";
import { videoCopy } from "./ai/tasks";
import { burnSubtitles, extractFrames, renderVideoCut } from "./media/ffmpeg";
import { derivativePath, resolveData } from "./storage";
import type { Segment } from "@/domain/roughcut";

type Prompt = { name: string; version: number } | null;
/** 生成好的一件成品，由调用方统一写库 */
export type VideoItem = { platform: PlatformKey | null; content: DerivativeContent; filePath?: string; prompt: Prompt };

export const VIDEO_PLATFORMS = (Object.keys(PLATFORMS) as PlatformKey[]).filter((k) => PLATFORMS[k].format === "video");

/** 哪些平台要字幕烧进画面：竖屏全部；横屏只有视频号（HANDOFF §3） */
export function needsBurned(orient: Orient, platforms: PlatformKey[]): boolean {
  const video = platforms.filter((k) => VIDEO_PLATFORMS.includes(k));
  return orient === "v" ? video.length > 0 : video.includes("sph");
}

/** 这个平台用哪个版本的成片 */
export function videoVariantFor(orient: Orient, platform: PlatformKey): "clean" | "burned" {
  return orient === "v" || platform === "sph" ? "burned" : "clean";
}

/**
 * 视频成品：粗剪成片、SRT 字幕、烧字幕版、封面候选帧、各视频平台文案。
 * 原文件只读，所有输出都写到 derivatives/<id>/ 下的新文件。
 */
export async function generateVideoItems(input: {
  sourceId: string;
  original: string;
  segments: Segment[];
  cleaned: Transcript;
  version: number;
  orient: Orient;
  title: string;
  topic: Topic;
  platforms: PlatformKey[];
  root: string;
  ai: { provider?: AiProvider };
  onStage?: (stage: string) => Promise<void>;
}): Promise<VideoItem[]> {
  const { sourceId, orient, root, version } = input;
  const rel = (name: string) => derivativePath(sourceId, name);
  const items: VideoItem[] = [];
  const duration = input.cleaned.duration;

  await input.onStage?.("render_video");
  const cleanRel = rel(`video-v${version}.mp4`);
  await renderVideoCut(input.original, input.segments, resolveData(cleanRel, root));
  items.push({ platform: null, content: { kind: "video", variant: "clean", orient, durationSec: duration }, filePath: cleanRel, prompt: null });

  const cues = buildCues(input.cleaned, orient);
  const srtRel = rel(`subtitles-v${version}.srt`);
  await fs.writeFile(resolveData(srtRel, root), toSrt(cues), "utf8");
  items.push({ platform: null, content: { kind: "subtitle", cues: cues.length }, filePath: srtRel, prompt: null });

  if (needsBurned(orient, input.platforms) && cues.length) {
    await input.onStage?.("burn_subtitles");
    const burnedRel = rel(`video-v${version}-subtitled.mp4`);
    await burnSubtitles(resolveData(cleanRel, root), resolveData(srtRel, root), resolveData(burnedRel, root), orient);
    items.push({ platform: null, content: { kind: "video", variant: "burned", orient, durationSec: duration }, filePath: burnedRel, prompt: null });
  }

  await input.onStage?.("cover");
  const times = [0.15, 0.4, 0.65].map((f) => Math.max(0, duration * f));
  const frames = await extractFrames(resolveData(cleanRel, root), times, resolveData(rel("cover"), root));
  const frameRels = frames.map((f) => rel(`cover/${path.basename(f)}`));
  items.push({ platform: null, content: { kind: "cover", frames: frameRels, title: input.title, orient }, filePath: frameRels[0], prompt: null });

  const targets = input.platforms.filter((k) => VIDEO_PLATFORMS.includes(k));
  if (targets.length) {
    await input.onStage?.("copy");
    const r = await videoCopy({ transcript: input.cleaned, title: input.title, topic: input.topic, orient, platforms: targets }, input.ai);
    for (const k of targets) {
      const c = r.data.platforms[k as keyof typeof r.data.platforms]!;
      items.push({ platform: k, content: { kind: "video_copy", title: c.title, desc: c.desc, tags: c.tags }, prompt: r.prompt });
    }
  }
  return items;
}
