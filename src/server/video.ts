import fs from "node:fs/promises";
import path from "node:path";
import type { DerivativeContent } from "@/domain/derivatives";
import { PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { buildCues, toSrt } from "@/domain/subtitles";
import type { Transcript } from "@/domain/transcript";
import type { Orient, Topic } from "@/domain/types";
import type { AiProvider } from "./ai";
import { videoCopy } from "./ai/tasks";
import { burnSubtitles, extractFrames, renderAudioVideo, renderVideoCut } from "./media/ffmpeg";
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

  items.push(...(await coverAndCopy({ ...input, video: cleanRel, duration })));
  return items;
}

/** 封面候选帧 + 各视频平台文案（视频和音频配画面共用） */
async function coverAndCopy(input: {
  sourceId: string;
  video: string;
  duration: number;
  cleaned: Transcript;
  orient: Orient;
  title: string;
  topic: Topic;
  platforms: PlatformKey[];
  root: string;
  ai: { provider?: AiProvider };
  onStage?: (stage: string) => Promise<void>;
}): Promise<VideoItem[]> {
  const items: VideoItem[] = [];
  await input.onStage?.("cover");
  const times = [0.15, 0.4, 0.65].map((f) => Math.max(0, input.duration * f));
  const frames = await extractFrames(resolveData(input.video, input.root), times, resolveData(derivativePath(input.sourceId, "cover"), input.root));
  const frameRels = frames.map((f) => derivativePath(input.sourceId, `cover/${path.basename(f)}`));
  items.push({ platform: null, content: { kind: "cover", frames: frameRels, title: input.title, orient: input.orient }, filePath: frameRels[0], prompt: null });

  const targets = input.platforms.filter((k) => VIDEO_PLATFORMS.includes(k));
  if (targets.length) {
    await input.onStage?.("copy");
    const r = await videoCopy({ transcript: input.cleaned, title: input.title, topic: input.topic, orient: input.orient, platforms: targets }, input.ai);
    for (const k of targets) {
      const c = r.data.platforms[k as keyof typeof r.data.platforms]!;
      items.push({ platform: k, content: { kind: "video_copy", title: c.title, desc: c.desc, tags: c.tags }, prompt: r.prompt });
    }
  }
  return items;
}

/**
 * 音频配画面（最省事的版本）：照片 + 声波 + 字幕烧进画面，横屏。
 * 声音用剪好的播客音频；同时出 SRT、封面候选帧和各视频平台文案。
 */
export async function generateAudioVideoItems(input: {
  sourceId: string;
  audio: string;
  cleaned: Transcript;
  version: number;
  title: string;
  topic: Topic;
  platforms: PlatformKey[];
  photo: string | null;
  root: string;
  ai: { provider?: AiProvider };
  onStage?: (stage: string) => Promise<void>;
}): Promise<VideoItem[]> {
  const { sourceId, root, version } = input;
  const items: VideoItem[] = [];
  const cues = buildCues(input.cleaned, "h");
  const srtRel = derivativePath(sourceId, `subtitles-v${version}.srt`);
  const srtAbs = resolveData(srtRel, root);
  await fs.mkdir(path.dirname(srtAbs), { recursive: true });
  await fs.writeFile(srtAbs, toSrt(cues), "utf8");
  items.push({ platform: null, content: { kind: "subtitle", cues: cues.length }, filePath: srtRel, prompt: null });

  await input.onStage?.("render_video");
  const videoRel = derivativePath(sourceId, `audio-video-v${version}.mp4`);
  await renderAudioVideo(resolveData(input.audio, root), cues.length ? srtAbs : null, resolveData(videoRel, root), { photo: input.photo });
  items.push({ platform: null, content: { kind: "video", variant: "burned", orient: "h", durationSec: input.cleaned.duration }, filePath: videoRel, prompt: null });

  items.push(...(await coverAndCopy({ ...input, video: videoRel, duration: input.cleaned.duration, orient: "h" })));
  return items;
}
