/** 把长文切成适合一次润色的块：优先在段落处切，段落太长再按句子切，实在没有标点就按长度硬切 */
export function splitForPolish(text: string, max = 2500): string[] {
  const pieces: string[] = [];
  for (const para of text.replace(/\r\n?/g, "\n").split(/\n+/).map((p) => p.trim()).filter(Boolean)) {
    if ([...para].length <= max) {
      pieces.push(para);
      continue;
    }
    const sentences = para.match(/[^。！？!?]+[。！？!?]*/gu) ?? [para];
    for (const s of sentences) {
      const chars = [...s];
      for (let i = 0; i < chars.length; i += max) pieces.push(chars.slice(i, i + max).join(""));
    }
  }
  const chunks: string[] = [];
  let cur = "";
  for (const p of pieces) {
    const sep = cur && /[。！？!?]$/.test(cur) ? "\n" : "";
    if (cur && [...cur].length + [...p].length + 1 > max) {
      chunks.push(cur);
      cur = p;
    } else cur = cur ? cur + (sep || "\n") + p : p;
  }
  if (cur) chunks.push(cur);
  return chunks;
}

/** 去掉空白后的字数 */
export function charCount(s: string): number {
  return [...s.replace(/\s+/g, "")].length;
}
