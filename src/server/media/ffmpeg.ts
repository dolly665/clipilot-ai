import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Segment } from "@/domain/roughcut";

const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const FFPROBE = process.env.FFPROBE_PATH || "ffprobe";

function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
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

  // 片段多时滤镜图很长，写到临时文件里传给 ffmpeg，避免命令行超长
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "qingqing-ff-"));
  const script = path.join(dir, "graph.txt");
  try {
    await fs.writeFile(script, graph);
    await run(FFMPEG, ["-y", "-v", "error", "-i", input, "-filter_complex_script", script, "-map", "[out]", "-ar", "44100", "-c:a", "libmp3lame", "-b:a", "128k", out]);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** 测试和开发用：生成一段指定时长的测试音 */
export async function makeTone(out: string, seconds: number) {
  await fs.mkdir(path.dirname(out), { recursive: true });
  await run(FFMPEG, ["-y", "-v", "error", "-f", "lavfi", "-i", `sine=frequency=440:duration=${seconds}`, "-c:a", "libmp3lame", out]);
}
