/**
 * 用真实的语音识别跑一个音频文件，打印识别结果和粗剪结果（会产生费用）。
 *   ASR_PROVIDER=volcengine VOLC_ASR_APP_ID=... VOLC_ASR_ACCESS_KEY=... npx tsx scripts/asr-smoke.ts 录音.m4a
 */
import "dotenv/config";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CUT_REASON_LABEL, cutStats, detectCuts } from "../src/domain/roughcut";
import { formatTime } from "../src/domain/transcript";
import { defaultAsr } from "../src/server/asr";
import { extractSpeechAudio, probe } from "../src/server/media/ffmpeg";

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error("用法：npx tsx scripts/asr-smoke.ts <音频文件>");
  const info = await probe(file);
  const speech = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "asr-smoke-")), "speech.mp3");
  await extractSpeechAudio(file, speech);
  const asr = defaultAsr();
  console.log(`识别提供方：${asr.name}，音频 ${formatTime(info.duration)}`);
  const t = await asr.transcribe(speech, { durationSec: info.duration });
  console.log(`识别出 ${t.sentences.length} 句、${t.words.length} 个词`);
  for (const s of t.sentences.slice(0, 10)) console.log(`  [${formatTime(s.start)}] ${s.text}`);
  for (const level of ["conservative", "standard", "tight"] as const) {
    const cuts = detectCuts(t, level);
    const st = cutStats(cuts, [], t.duration);
    const by = Object.entries(st.byReason).map(([r, n]) => `${CUT_REASON_LABEL[r as keyof typeof CUT_REASON_LABEL]} ${n}`).join("，");
    console.log(`${level}: 剪 ${st.count} 处，共 ${formatTime(st.removed)}（${by}）`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
