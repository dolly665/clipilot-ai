/**
 * 润色结果和作者认可版本的对比指标。不追求一字不差，只看几件作者在意的事：
 * 错字改没改、口头推进词留没留、段落是不是短、篇幅是不是接近、有没有混进转写工具的东西。
 */

const FILLERS = ["那", "其实", "我认为", "我觉得", "所以", "当然", "只是说", "就是"];
const STUTTER = /(.{2,6})[，。、]?\1|([一-龥])\2(?!\2)/gu;

const chars = (s: string) => [...s.replace(/\s+/g, "")].length;
const paragraphs = (s: string) => s.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
const count = (s: string, w: string) => s.split(w).length - 1;

/** 字级 bigram 的 Dice 相似度，0–1 */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const c = [...s.replace(/\s+/g, "")];
    const m = new Map<string, number>();
    for (let i = 0; i < c.length - 1; i++) m.set(c[i]! + c[i + 1]!, (m.get(c[i]! + c[i + 1]!) ?? 0) + 1);
    return m;
  };
  const ga = grams(a), gb = grams(b);
  let inter = 0, total = 0;
  for (const [k, v] of ga) { inter += Math.min(v, gb.get(k) ?? 0); total += v; }
  for (const v of gb.values()) total += v;
  return total ? (2 * inter) / total : 1;
}

export type PolishScore = Record<string, { 结果: string | number; 认可版: string | number }>;

export function scorePolish(output: string, approved: string, raw: string): PolishScore {
  const avgLen = (s: string) => Math.round(chars(s) / Math.max(1, paragraphs(s).length));
  const fillers = (s: string) => FILLERS.reduce((n, w) => n + count(s, w), 0);
  const leaks = (s: string) => (/(说话人\s*\d|\d{2}:\d{2}:\d{2}|大模型生成)/.test(s) ? "有" : "无");
  const md = (s: string) => (/^\s*(#|\*|-\s)/m.test(s) ? "有" : "无");
  const stutters = (s: string) => (s.match(STUTTER) ?? []).length;
  return {
    "篇幅（占原文）": { 结果: `${Math.round((chars(output) / chars(raw)) * 100)}%`, 认可版: `${Math.round((chars(approved) / chars(raw)) * 100)}%` },
    段落数: { 结果: paragraphs(output).length, 认可版: paragraphs(approved).length },
    平均每段字数: { 结果: avgLen(output), 认可版: avgLen(approved) },
    口头推进词次数: { 结果: fillers(output), 认可版: fillers(approved) },
    疑似重复卡顿: { 结果: stutters(output), 认可版: stutters(approved) },
    混进转写工具内容: { 结果: leaks(output), 认可版: leaks(approved) },
    Markdown符号: { 结果: md(output), 认可版: md(approved) },
    和认可版相似度: { 结果: similarity(output, approved).toFixed(2), 认可版: "1.00" },
  };
}
