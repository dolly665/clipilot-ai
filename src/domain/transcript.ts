/** 语音识别结果。时间单位统一为秒。 */
export type Word = { text: string; start: number; end: number };

/** 一句话：words 是它在 Transcript.words 里的下标范围 [from, to) */
export type Sentence = { text: string; start: number; end: number; from: number; to: number };

export type Transcript = { duration: number; words: Word[]; sentences: Sentence[] };

const PUNCT = /[\s，。！？、；：,.!?;:"'“”‘’（）()《》【】…—-]/g;

export function stripPunct(s: string): string {
  return s.replace(PUNCT, "");
}

export function wordsText(words: Word[], from = 0, to = words.length): string {
  return words.slice(from, to).map((w) => w.text).join("");
}

/** 全文：一句一行（合规扫描和生成都用它，命中位置也相对于它） */
export function transcriptText(t: Transcript): string {
  return t.sentences.map((s) => s.text).join("\n");
}

/** 把句子的文字和时间对齐到词上；没给句子时按词里的停顿自动分句 */
export function normalizeTranscript(t: Transcript): Transcript {
  const words = [...t.words].filter((w) => w.end > w.start || w.text).sort((a, b) => a.start - b.start);
  let sentences = t.sentences;
  if (!sentences.length && words.length) {
    sentences = [];
    let from = 0;
    for (let i = 1; i <= words.length; i++) {
      const prev = words[i - 1]!;
      const next = words[i];
      if (!next || next.start - prev.end > 0.8) {
        sentences.push({ text: wordsText(words, from, i), start: words[from]!.start, end: prev.end, from, to: i });
        from = i;
      }
    }
  }
  return { duration: Math.max(t.duration, words.at(-1)?.end ?? 0), words, sentences };
}

/** 秒 → 00:00 / 1:02:03 */
export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${String(m).padStart(2, "0")}:${ss}`;
}


/**
 * 用一段带标记的文字造一份逐字稿：每个字 0.2 秒；
 * "/" 表示 1 秒停顿，"_" 表示 0.2 秒小停顿，"。" 结束一句；
 * "[那个]" 这样的方括号表示一个多字的词。
 */
export function transcriptFromSpec(spec: string, opts: { charSec?: number; tail?: number } = {}): Transcript {
  const cs = opts.charSec ?? 0.2;
  const words: Word[] = [];
  const sentences: Sentence[] = [];
  let t = 0;
  let from = 0;
  let sentenceText = "";
  const tokens = spec.match(/\[[^\]]+\]|./gu) ?? [];
  for (const tok of tokens) {
    if (tok === "/") { t += 1; continue; }
    if (tok === "_") { t += 0.2; continue; }
    if (tok === "。") {
      if (words.length > from) {
        sentences.push({ text: sentenceText + "。", start: words[from]!.start, end: words.at(-1)!.end, from, to: words.length });
      }
      from = words.length;
      sentenceText = "";
      continue;
    }
    const text = tok.startsWith("[") ? tok.slice(1, -1) : tok;
    const len = [...text].length * cs;
    words.push({ text, start: +t.toFixed(2), end: +(t + len).toFixed(2) });
    sentenceText += text;
    t += len;
  }
  if (words.length > from) sentences.push({ text: sentenceText, start: words[from]!.start, end: words.at(-1)!.end, from, to: words.length });
  return normalizeTranscript({ duration: +(t + (opts.tail ?? 0)).toFixed(2), words, sentences });
}
