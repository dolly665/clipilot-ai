import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Segment } from "@/domain/roughcut";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"], cwd: opts.cwd });
    let stdout = "";
    let stderr = "";
    p.stdout.on("data", (d) => (stdout += d));
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => reject(new Error(`无法运行 ${cmd}（是否已安装？）：${e.message}`)));
    p.on("close", (code) => (code === 0 ? resolve({ stdout, stderr }) : reject(new Error(`${cmd} 退出码 ${code}：${stderr.slice(-800)}`))));
  });
}

export type ProbeResult = {
  duration: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width?: number;
  height?: number;
  /** 按旋转信息修正后的画幅 */
  orient?: "h" | "v";
  formatName: string;
};

type FfprobeStream = { codec_type?: string; width?: number; height?: number; tags?: { rotate?: string }; side_data_list?: { rotation?: number }[]; disposition?: { attached_pic?: number } };

export async function probe(file: string): Promise<ProbeResult> {
  const { stdout } = await run(FFPROBE, ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]);
  const j = JSON.parse(stdout) as { format?: { duration?: string; format_name?: string }; streams?: FfprobeStream[] };
  const streams = j.streams ?? [];
  // 音频文件里的封面图也是 video 流，要排除
  const video = streams.find((s) => s.codec_type === "video" && !s.disposition?.attached_pic);
  const r: ProbeResult = {
    duration: Number(j.format?.duration ?? 0),
    hasAudio: streams.some((s) => s.codec_type === "audio"),
    hasVideo: !!video,
    formatName: j.format?.format_name ?? "",
  };
  if (video?.width && video.height) {
    const rot = Math.abs(Number(video.tags?.rotate ?? video.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? 0)) % 180;
    const [w, h] = rot === 90 ? [video.height, video.width] : [video.width, video.height];
    Object.assign(r, { width: w, height: h, orient: h > w ? "v" : "h" });
  }
  return r;
}

/** 抽出给语音识别用的音轨：16kHz 单声道 MP3（体积小，识别接口都支持） */
export async function extractSpeechAudio(input: string, out: string) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run(FFMPEG, ["-y", "-v", "error", "-i", input, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "libmp3lame", "-b:a", "48k", out]);
}

/**
 * 按保留片段拼接音频，接缝处 10ms 淡入淡出防止爆音；
 * 可选响度统一到 -16 LUFS（播客常用标准）。原文件不动，输出到新文件。
 */
export async function renderAudioCut(input: string, segments: Segment[], out: string, opts: { loudnorm?: boolean } = {}) {
  if (!segments.length) throw new Error("没有可保留的片段");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const fade = 0.01;
  const parts = segments.map((s, i) => {
    const len = Math.max(s.end - s.start, fade * 2);
    return `[0:a]atrim=start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${(len - fade).toFixed(3)}:d=${fade}[a${i}]`;
  });
  const concat = `${segments.map((_, i) => `[a${i}]`).join("")}concat=n=${segments.length}:v=0:a=1[cat]`;
  const tail = opts.loudnorm ? ";[cat]loudnorm=I=-16:TP=-1.5:LRA=11[out]" : ";[cat]anull[out]";
  const graph = [...parts, concat].join(";") + tail;

  await runWithGraph(graph, (script) => ["-y", "-v", "error", "-i", input, "-filter_complex_script", script, "-map", "[out]", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", out]);
}

/** 测试和开发用：生成一段指定时长的测试音 */
export async function makeTone(out: string, seconds: number) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "libmp3lame", out]);
}

/** 把滤镜图写到临时文件里跑 ffmpeg（片段多时命令行会超长） */
async function runWithGraph(graph: string, args: (script: string) => string[]) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qingqing-ff-"));
  const script = path.join(dir, "graph.txt");
  try {
    await fs.writeFile(script, graph);
    await run(FFMPEG, args(script));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

const H264 = ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart"];

/**
 * 视频粗剪：按保留片段剪画面和声音再拼起来，声音接缝淡入淡出、响度统一。
 * 原文件不动，输出新文件。画面方向按原视频的旋转信息自动摆正。
 */
export async function renderVideoCut(input: string, segments: Segment[], out: string) {
  if (!segments.length) throw new Error("没有可保留的片段");
  await fs.mkdir(path.dirname(out), { recursive: true });
  const fade = 0.01;
  const parts = segments.flatMap((s, i) => {
    const len = Math.max(s.end - s.start, fade * 2);
    const range = `start=${s.start.toFixed(3)}:end=${s.end.toFixed(3)}`;
    return [
      `[0:v]trim=${range},setpts=PTS-STARTPTS[v${i}]`,
      `[0:a]atrim=${range},asetpts=PTS-STARTPTS,afade=t=in:d=${fade},afade=t=out:st=${(len - fade).toFixed(3)}:d=${fade}[a${i}]`,
    ];
  });
  const concat = `${segments.map((_, i) => `[v${i}][a${i}]`).join("")}concat=n=${segments.length}:v=1:a=1[vc][ac]`;
  const graph = [...parts, concat, "[ac]loudnorm=I=-16:TP=-1.5:LRA=11[aout]"].join(";");
  await runWithGraph(graph, (script) => ["-y", "-v", "error", "-i", input, "-filter_complex_script", script, "-map", "[vc]", "-map", "[aout]", "-ar", "48000", ...H264, out]);
}

/** 字幕字体：Windows 默认微软雅黑，可在 .env 里用 SUBTITLE_FONT 改 */
export function subtitleFont() {
  return process.env.SUBTITLE_FONT || "Microsoft YaHei";
}

/**
 * 把 SRT 字幕烧进画面（竖屏和视频号用）。
 * 在字幕所在目录里运行 ffmpeg、只传文件名，避开 Windows 路径在滤镜参数里的转义问题。
 */
export async function burnSubtitles(input: string, srt: string, out: string, orient: "h" | "v") {
  await fs.mkdir(path.dirname(out), { recursive: true });
  const style = [`FontName=${subtitleFont()}`, `FontSize=${orient === "v" ? 12 : 20}`, "Bold=1", "PrimaryColour=&H00FFFFFF", "OutlineColour=&H00000000", "BorderStyle=1", "Outline=1.2", "Shadow=0", `MarginV=${orient === "v" ? 60 : 18}`].join(",");
  await run(FFMPEG, ["-y", "-v", "error", "-i", path.resolve(input), "-vf", `subtitles=${path.basename(srt)}:charenc=UTF-8:force_style='${style}'`, ...H264, path.resolve(out)], { cwd: path.dirname(path.resolve(srt)) });
}

/** 在指定时间点各抽一帧，存成 JPG（封面候选） */
export async function extractFrames(input: string, times: number[], outDir: string): Promise<string[]> {
  await fs.mkdir(outDir, { recursive: true });
  const outs: string[] = [];
  for (const [i, t] of times.entries()) {
    const out = path.join(outDir, `frame-${i + 1}.jpg`);
    await run(FFMPEG, ["-y", "-v", "error", "-ss", t.toFixed(2), "-i", input, "-frames:v", "1", "-q:v", "2", out]);
    outs.push(out);
  }
  return outs;
}

/** 测试和开发用：生成一段带测试音的测试视频 */
export async function makeTestVideo(out: string, seconds: number, size = "320x180") {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run(FFMPEG, [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", `testsrc=size=${size}:rate=25:duration=${seconds}`,
    "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`,
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", out,
  ]);
}

/**
 * 音频配画面（最省事的版本）：一张照片（没有就用纯色）+ 声波 + 烧进画面的大字幕，横屏 1920×1080。
 * 照片按画面裁满并略压暗，让字幕和声波看得清。
 */
export async function renderAudioVideo(audio: string, srt: string | null, out: string, opts: { photo?: string | null } = {}) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  const bgInput = opts.photo ? ["-loop", "1", "-framerate", "25", "-i", path.resolve(opts.photo)] : ["-f", "lavfi", "-i", "color=c=0x4A453D:s=1920x1080:r=25"];
  const style = [`FontName=${subtitleFont()}`, "FontSize=22", "Bold=1", "PrimaryColour=&H00FFFFFF", "OutlineColour=&H00000000", "BorderStyle=1", "Outline=1.4", "Shadow=0", "MarginV=34"].join(",");
  const sub = srt ? `,subtitles=${path.basename(srt)}:charenc=UTF-8:force_style='${style}'` : "";
  const graph = [
    `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1${opts.photo ? ",eq=brightness=-0.12" : ""},format=yuv420p[bg]`,
    "[1:a]showwaves=s=1200x160:mode=cline:rate=25:draw=full:scale=sqrt:colors=0xF2EDE4,format=rgba,colorchannelmixer=aa=0.8[w]",
    `[bg][w]overlay=(W-w)/2:H*0.58:shortest=1${sub}[v]`,
  ].join(";");
  await run(
    FFMPEG,
    ["-y", "-v", "error", ...bgInput, "-i", path.resolve(audio), "-filter_complex", graph, "-map", "[v]", "-map", "1:a", "-shortest", "-r", "25", ...H264, path.resolve(out)],
    { cwd: srt ? path.dirname(path.resolve(srt)) : undefined },
  );
}
