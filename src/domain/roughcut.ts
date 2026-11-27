import { stripPunct, wordsText, type Sentence, type Transcript, type Word } from "./transcript";
import type { RoughCutLevel } from "./types";

/**
 * 粗剪：根据逐字时间戳找出该剪掉的地方。纯函数，不碰文件。
 * 每一刀单独记录，用户可以逐刀恢复。
 */
export type CutReason = "pause" | "filler" | "repeat" | "retake";
export type Cut = { id: string; start: number; end: number; reason: CutReason; text?: string };
export type Segment = { start: number; end: number };

export const CUT_REASON_LABEL: Record<CutReason, string> = {
  pause: "停顿",
  filler: "口头禅",
  repeat: "重复",
  retake: "说错重来",
};

type LevelConfig = {
  /** 超过这么长的停顿才剪（秒） */
  pauseMin: number;
  /** 剪停顿时两边各留多少（秒） */
  pauseKeep: number;
  /** 不论前后都剪的语气词 */
  fillersAlways: string[];
  /** 只在单独出现（前后有停顿或在句首句尾）时才剪 */
  fillersIsolated: string[];
  /** 重复片段至少多少个字才剪；1 表示单字重复也剪（要求两次之间有明显停顿） */
  repeatMinChars: number;
  /** 下一句开头和这一句开头相同的字数达到多少，就判为说错重来 */
  retakeMinChars: number;
};

export const LEVELS: Record<RoughCutLevel, LevelConfig> = {
  conservative: {
    pauseMin: 1.2,
    pauseKeep: 0.35,
    fillersAlways: ["嗯", "呃", "额"],
    fillersIsolated: [],
    repeatMinChars: 3,
    retakeMinChars: 6,
  },
  standard: {
    pauseMin: 0.7,
    pauseKeep: 0.25,
    fillersAlways: ["嗯", "呃", "额"],
    fillersIsolated: ["啊", "哎", "唉", "那个"],
    repeatMinChars: 2,
    retakeMinChars: 4,
  },
  tight: {
    pauseMin: 0.45,
    pauseKeep: 0.15,
    fillersAlways: ["嗯", "呃", "额"],
    fillersIsolated: ["啊", "哎", "唉", "那个", "就是说", "然后呢", "对吧"],
    repeatMinChars: 1,
    retakeMinChars: 3,
  },
};

const ISOLATION_GAP = 0.12;
const PRIORITY: Record<CutReason, number> = { retake: 3, repeat: 2, filler: 1, pause: 0 };
const r2 = (x: number) => Math.round(x * 100) / 100;
const makeCut = (reason: CutReason, start: number, end: number, text?: string): Cut => ({
  id: `${reason}-${r2(start).toFixed(2)}`,
  start: r2(start),
  end: r2(end),
  reason,
  ...(text ? { text } : {}),
});

function sentenceOf(sentences: Sentence[], wordIndex: number): Sentence | undefined {
  return sentences.find((s) => wordIndex >= s.from && wordIndex < s.to);
}

function detectPauses(t: Transcript, cfg: LevelConfig): Cut[] {
  const cuts: Cut[] = [];
  const { words } = t;
  if (!words.length) return cuts;
  const k = cfg.pauseKeep;
  const first = words[0]!;
  if (first.start > k * 2) cuts.push(makeCut("pause", 0, first.start - k));
  for (let i = 0; i < words.length - 1; i++) {
    const a = words[i]!;
    const b = words[i + 1]!;
    if (b.start - a.end > cfg.pauseMin) cuts.push(makeCut("pause", a.end + k, b.start - k));
  }
  const last = words.at(-1)!;
  if (t.duration - last.end > k * 2) cuts.push(makeCut("pause", last.end + k, t.duration));
  return cuts;
}

function detectFillers(t: Transcript, cfg: LevelConfig): Cut[] {
  const cuts: Cut[] = [];
  const { words, sentences } = t;
  for (let i = 0; i < words.length; i++) {
    for (let n = 3; n >= 1; n--) {
      if (i + n > words.length) continue;
      const text = stripPunct(wordsText(words, i, i + n));
      if (!text) continue;
      const always = cfg.fillersAlways.includes(text) || (cfg.fillersAlways.length > 0 && /^[嗯呃额]+$/.test(text));
      const isolatedOk = cfg.fillersIsolated.includes(text);
      if (!always && !isolatedOk) continue;
      if (!always) {
        const s = sentenceOf(sentences, i);
        const prev = words[i - 1];
        const next = words[i + n];
        const isolated =
          !prev || !next ||
          (s && (i === s.from || i + n === s.to)) ||
          words[i]!.start - prev.end >= ISOLATION_GAP ||
          next.start - words[i + n - 1]!.end >= ISOLATION_GAP;
        if (!isolated) continue;
      }
      cuts.push(makeCut("filler", words[i]!.start, words[i + n - 1]!.end, text));
      i += n - 1;
      break;
    }
  }
  return cuts;
}

function detectRepeats(t: Transcript, cfg: LevelConfig): Cut[] {
  const cuts: Cut[] = [];
  const { words } = t;
  for (let i = 0; i < words.length; i++) {
    for (let k = 4; k >= 1; k--) {
      if (i + 2 * k > words.length) continue;
      const a = stripPunct(wordsText(words, i, i + k));
      const b = stripPunct(wordsText(words, i + k, i + 2 * k));
      if (!a || a !== b) continue;
      const chars = [...a].length;
      if (chars < cfg.repeatMinChars) continue;
      // 单字叠词（看看、谢谢）中间没有停顿，是正常说法；只有停顿明显时才算口误重复
      if (chars === 1 && words[i + k]!.start - words[i + k - 1]!.end < 0.15) continue;
      cuts.push(makeCut("repeat", words[i]!.start, words[i + k]!.start, a));
      i += k - 1;
      break;
    }
  }
  return cuts;
}

function commonPrefix(a: string, b: string): number {
  const x = [...a];
  const y = [...b];
  let n = 0;
  while (n < x.length && n < y.length && x[n] === y[n]) n++;
  return n;
}

function detectRetakes(t: Transcript, cfg: LevelConfig): Cut[] {
  const cuts: Cut[] = [];
  const ss = t.sentences;
  for (let i = 0; i < ss.length - 1; i++) {
    const a = stripPunct(ss[i]!.text);
    const b = stripPunct(ss[i + 1]!.text);
    const p = commonPrefix(a, b);
    // 下一句以同样的开头重说一遍，而且这一句没比下一句长多少 → 前一句是说错的那遍
    if (p >= cfg.retakeMinChars && [...a].length <= [...b].length + 2) {
      cuts.push(makeCut("retake", ss[i]!.start, ss[i + 1]!.start, ss[i]!.text));
    }
  }
  return cuts;
}

/** 被更高优先级的刀完全包住的刀丢掉，避免同一处重复计数 */
function dedupe(cuts: Cut[]): Cut[] {
  const sorted = [...cuts].filter((c) => c.end - c.start > 0.02).sort((a, b) => PRIORITY[b.reason] - PRIORITY[a.reason]);
  const kept: Cut[] = [];
  const ids = new Set<string>();
  for (const c of sorted) {
    if (kept.some((k) => k.start <= c.start && k.end >= c.end)) continue;
    if (ids.has(c.id)) continue;
    ids.add(c.id);
    kept.push(c);
  }
  return kept.sort((a, b) => a.start - b.start);
}

export function detectCuts(t: Transcript, level: RoughCutLevel): Cut[] {
  const cfg = LEVELS[level];
  return dedupe([...detectRetakes(t, cfg), ...detectRepeats(t, cfg), ...detectFillers(t, cfg), ...detectPauses(t, cfg)]);
}

/** 去掉生效的刀之后保留的片段 */
export function keepSegments(duration: number, cuts: Cut[], restored: readonly string[] = []): Segment[] {
  const active = cuts.filter((c) => !restored.includes(c.id)).map((c) => ({ start: Math.max(0, c.start), end: Math.min(duration, c.end) }));
  active.sort((a, b) => a.start - b.start);
  const merged: Segment[] = [];
  for (const c of active) {
    const last = merged.at(-1);
    if (last && c.start <= last.end) last.end = Math.max(last.end, c.end);
    else merged.push({ ...c });
  }
  const keep: Segment[] = [];
  let at = 0;
  for (const m of merged) {
    if (m.start > at) keep.push({ start: at, end: m.start });
    at = Math.max(at, m.end);
  }
  if (at < duration) keep.push({ start: at, end: duration });
  return keep.filter((s) => s.end - s.start >= 0.05).map((s) => ({ start: r2(s.start), end: r2(s.end) }));
}

export function totalLength(segments: Segment[]): number {
  return segments.reduce((n, s) => n + (s.end - s.start), 0);
}

/** 原始时间 → 剪辑后的时间；落在被剪掉的部分里返回 null */
export function mapTime(segments: Segment[], t: number): number | null {
  let offset = 0;
  for (const s of segments) {
    if (t < s.start) return null;
    if (t <= s.end) return offset + (t - s.start);
    offset += s.end - s.start;
  }
  return null;
}

/** 剪辑后的逐字稿：去掉被剪的词，时间换算到成片时间轴上（用于字幕和节目时间戳） */
export function remapTranscript(t: Transcript, segments: Segment[]): Transcript {
  const words: Word[] = [];
  const indexMap = new Map<number, number>();
  t.words.forEach((w, i) => {
    const mid = (w.start + w.end) / 2;
    const s = mapTime(segments, mid);
    if (s === null) return;
    const start = mapTime(segments, w.start) ?? s;
    const end = mapTime(segments, w.end) ?? s;
    indexMap.set(i, words.length);
    words.push({ text: w.text, start: r2(start), end: r2(Math.max(end, start)) });
  });
  const sentences: Sentence[] = [];
  for (const s of t.sentences) {
    const idx = [...Array(s.to - s.from).keys()].map((k) => indexMap.get(s.from + k)).filter((x): x is number => x !== undefined);
    if (!idx.length) continue;
    const from = idx[0]!;
    const to = idx.at(-1)! + 1;
    const allKept = idx.length === s.to - s.from;
    sentences.push({ text: allKept ? s.text : wordsText(words, from, to), start: words[from]!.start, end: words[to - 1]!.end, from, to });
  }
  return { duration: r2(totalLength(segments)), words, sentences };
}

export type CutStats = { count: number; removed: number; byReason: Record<CutReason, number> };

export function cutStats(cuts: Cut[], restored: readonly string[], duration: number): CutStats {
  const active = cuts.filter((c) => !restored.includes(c.id));
  const byReason: Record<CutReason, number> = { pause: 0, filler: 0, repeat: 0, retake: 0 };
  for (const c of active) byReason[c.reason]++;
  return { count: active.length, removed: r2(duration - totalLength(keepSegments(duration, cuts, restored))), byReason };
}
