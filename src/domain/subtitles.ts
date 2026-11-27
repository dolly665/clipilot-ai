import type { Transcript } from "./transcript";
import type { Orient } from "./types";

/** 一条字幕：时间单位秒 */
export type Cue = { start: number; end: number; text: string };

/** 每行最多几个字：竖屏画面窄，字要少 */
export const CUE_MAX_CHARS: Record<Orient, number> = { h: 18, v: 12 };

const END_PUNCT = /[，。！？、；：,.!?;:…]+$/;
const BREAK_AFTER = /[，。！？；：,.!?;:…]$/;

/**
 * 按逐字时间戳切字幕：一句话里超过行宽就拆，遇到标点或停顿优先断开。
 * 行尾标点去掉（中文字幕习惯），行内逗号换成空格。
 */
export function buildCues(t: Transcript, orient: Orient): Cue[] {
  const max = CUE_MAX_CHARS[orient];
  const cues: Cue[] = [];
  for (const s of t.sentences) {
    const words = t.words.slice(s.from, s.to);
    let text = "";
    let start = words[0]?.start ?? s.start;
    let end = start;
    const flush = () => {
      const clean = text.replace(END_PUNCT, "").replace(/[，、,]/g, " ").trim();
      if (clean) cues.push({ start, end, text: clean });
      text = "";
    };
    words.forEach((w, i) => {
      const len = [...text.replace(END_PUNCT, "")].length;
      const gap = i > 0 ? w.start - words[i - 1]!.end : 0;
      if (text && (len + [...w.text].length > max || gap > 0.6)) flush();
      if (!text) start = w.start;
      text += w.text;
      end = w.end;
      if (BREAK_AFTER.test(w.text) && [...text].length >= max / 2) flush();
    });
    flush();
  }
  // 相邻字幕不重叠；太短的显示时间补到 0.6 秒（不超过下一条开始）
  for (let i = 0; i < cues.length; i++) {
    const c = cues[i]!;
    const next = cues[i + 1];
    if (c.end - c.start < 0.6) c.end = c.start + 0.6;
    if (next && c.end > next.start) c.end = next.start;
  }
  return cues;
}

function stamp(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms % 1000, 3)}`;
}

/** SRT 字幕文件（B站、YouTube 上传用；烧进画面也用它） */
export function toSrt(cues: Cue[]): string {
  return cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join("\n");
}
