/** 长文排版：原文一个字不改，只插入小标题、金句、标题和导语 */

export type ArticleBlock =
  | { type: "heading"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string };

export type Article = { title: string; lead: string; blocks: ArticleBlock[] };

export type LayoutPlan = {
  title: string;
  lead: string;
  headings: { before: number; text: string }[];
  quotes: string[];
};

/** 按空行或换行切段，去掉首尾空白；空段丢弃 */
export function splitParagraphs(text: string): string[] {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function numberParagraphs(paragraphs: string[]): string {
  return paragraphs.map((p, i) => `[${i}] ${p}`).join("\n\n");
}

/**
 * 按排版方案组装文章。不可信的部分（越界的段落号、不是原文的「金句」）直接丢弃，
 * 保证输出里的段落与原文逐字一致、顺序不变。
 */
export function assembleArticle(paragraphs: string[], plan: LayoutPlan): Article {
  const headingsAt = new Map<number, string[]>();
  for (const h of plan.headings) {
    if (h.before < 0 || h.before >= paragraphs.length) continue;
    headingsAt.set(h.before, [...(headingsAt.get(h.before) ?? []), h.text.trim()]);
  }

  // 每句金句放在它出处那一段之后；同一句只用一次
  const quotesAfter = new Map<number, string[]>();
  const used = new Set<string>();
  for (const raw of plan.quotes) {
    const q = raw.trim();
    if (!q || used.has(q)) continue;
    const idx = paragraphs.findIndex((p) => p.includes(q));
    if (idx < 0) continue;
    used.add(q);
    quotesAfter.set(idx, [...(quotesAfter.get(idx) ?? []), q]);
  }

  const blocks: ArticleBlock[] = [];
  paragraphs.forEach((p, i) => {
    for (const h of headingsAt.get(i) ?? []) blocks.push({ type: "heading", text: h });
    blocks.push({ type: "paragraph", text: p });
    for (const q of quotesAfter.get(i) ?? []) blocks.push({ type: "quote", text: q });
  });
  return { title: plan.title.trim(), lead: plan.lead.trim(), blocks };
}

/** 复制用的 Markdown（公众号编辑器、知乎都能粘贴） */
export function articleToMarkdown(a: Article): string {
  const parts = [`# ${a.title}`];
  if (a.lead) parts.push(`> ${a.lead}`);
  for (const b of a.blocks) {
    if (b.type === "heading") parts.push(`## ${b.text}`);
    else if (b.type === "quote") parts.push(`> **${b.text}**`);
    else parts.push(b.text);
  }
  return parts.join("\n\n") + "\n";
}

export function articleParagraphs(a: Article): string[] {
  return a.blocks.flatMap((b) => (b.type === "paragraph" ? [b.text] : []));
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * 公众号编辑器用的富文本：只用内联样式（编辑器会丢掉 <style> 和 class），
 * 复制后直接粘进公众号后台，格式不乱。
 */
export function articleToWechatHtml(a: Article, accent = "#1D6B60"): string {
  const p = (t: string) => `<p style="margin:0 0 1.2em;font-size:16px;line-height:1.85;color:#333;letter-spacing:0.5px;">${esc(t)}</p>`;
  const parts: string[] = [];
  if (a.lead) parts.push(`<p style="margin:0 0 1.6em;font-size:15px;line-height:1.8;color:#888;">${esc(a.lead)}</p>`);
  for (const b of a.blocks) {
    if (b.type === "heading") {
      parts.push(`<h2 style="margin:1.8em 0 0.9em;padding-left:10px;border-left:4px solid ${accent};font-size:18px;font-weight:bold;line-height:1.5;color:#222;">${esc(b.text)}</h2>`);
    } else if (b.type === "quote") {
      parts.push(`<blockquote style="margin:1.4em 0;padding:14px 18px;background:#F2F7F5;border-radius:8px;font-size:16px;line-height:1.8;color:${accent};font-weight:bold;">${esc(b.text)}</blockquote>`);
    } else parts.push(p(b.text));
  }
  return `<section style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">${parts.join("")}</section>`;
}
