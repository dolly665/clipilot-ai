/**
 * 录音转写导出稿的预处理（润色前跑）。转写工具导出的文本常带：
 * 开头的 AI 摘要、「以上由AI大模型生成…」免责声明、「说话人1 00:00:01」这样的说话人和时间行。
 * 这些都不是作者说的话，留着会被润色进底稿。
 */

const SPEAKER_LINE = /^\s*(说话人|发言人|讲话人|Speaker)\s*\d*\s*[:：]?\s*\d{1,2}:\d{2}(:\d{2})?\s*$/i;
const TIME_LINE = /^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s*$/;
const DISCLAIMER = /^\s*(以上|本(摘要|总结|内容)).{0,12}(AI|人工智能|大模型).{0,12}生成.*$/i;

export type CleanResult = { text: string; removed: string[] };

export function cleanTranscriptExport(raw: string): CleanResult {
  const lines = raw.replace(/\r\n?/g, "\n").split("\n");
  const removed: string[] = [];
  const firstSpeaker = lines.findIndex((l) => SPEAKER_LINE.test(l));
  const disclaimerAt = lines.findIndex((l) => DISCLAIMER.test(l));
  // 免责声明出现在第一个说话人行之前：它和它上面的内容都是工具生成的摘要
  const headEnd = disclaimerAt >= 0 && (firstSpeaker < 0 || disclaimerAt < firstSpeaker) ? disclaimerAt + 1 : 0;
  if (headEnd > 0) removed.push(...lines.slice(0, headEnd).filter((l) => l.trim()));
  const kept: string[] = [];
  for (const l of lines.slice(headEnd)) {
    if (SPEAKER_LINE.test(l) || TIME_LINE.test(l) || DISCLAIMER.test(l)) {
      if (l.trim()) removed.push(l.trim());
      continue;
    }
    kept.push(l);
  }
  return { text: kept.join("\n").trim(), removed };
}
