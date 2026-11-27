import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { normalizeTranscript, type Sentence, type Transcript, type Word } from "@/domain/transcript";
import { AsrError, type AsrProvider } from "./types";

/**
 * 火山引擎（豆包语音）大模型录音文件识别 · 极速版：直接上传音频数据，同步返回结果。
 *
 * 注意：字段名按火山引擎文档实现，**还没有用真实接口验证过**（开发环境访问不到火山引擎）。
 * 第一次接真实密钥时，请用 scripts/asr-smoke.ts 跑一遍，对不上的地方改这个文件即可。
 *
 * enable_ddc（语义顺滑）必须关掉：我们要保留「嗯」「那个」和重复，自己决定剪不剪。
 */
const Word_ = z.object({ text: z.string(), start_time: z.number(), end_time: z.number() });
const Utterance = z.object({ text: z.string(), start_time: z.number(), end_time: z.number(), words: z.array(Word_).optional() });
const Response = z.object({
  audio_info: z.object({ duration: z.number().optional() }).optional(),
  result: z.object({ text: z.string().optional(), utterances: z.array(Utterance).optional() }),
});

const SUCCESS = "20000000";
const MAX_BYTES = 100 * 1024 * 1024;

export function createVolcengineAsr(opts: {
  appId: string | undefined;
  accessKey: string | undefined;
  resourceId?: string;
  baseUrl?: string;
}): AsrProvider {
  const url = `${opts.baseUrl ?? "https://openspeech.bytedance.com"}/api/v3/auc/bigmodel/recognize/flash`;
  return {
    name: "volcengine",
    async transcribe(audioPath) {
      if (!opts.appId || !opts.accessKey) throw new AsrError("火山引擎语音识别未配置：需要 VOLC_ASR_APP_ID 和 VOLC_ASR_ACCESS_KEY");
      const data = await fs.readFile(audioPath);
      if (data.length > MAX_BYTES) throw new AsrError("音频超过 100MB，极速版接口不支持");
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Api-App-Key": opts.appId,
          "X-Api-Access-Key": opts.accessKey,
          "X-Api-Resource-Id": opts.resourceId ?? "volc.bigasr.auc_turbo",
          "X-Api-Request-Id": randomUUID(),
          "X-Api-Sequence": "-1",
        },
        body: JSON.stringify({
          user: { uid: "qingqing" },
          audio: { data: data.toString("base64") },
          request: { model_name: "bigmodel", enable_itn: true, enable_punc: true, enable_ddc: false, show_utterances: true },
        }),
      });
      const code = res.headers.get("X-Api-Status-Code");
      if (!res.ok || (code && code !== SUCCESS)) {
        const msg = res.headers.get("X-Api-Message") ?? (await res.text().catch(() => "")).slice(0, 300);
        throw new AsrError(`火山引擎语音识别失败（HTTP ${res.status}，状态码 ${code ?? "无"}）：${msg}`);
      }
      const parsed = Response.safeParse(await res.json());
      if (!parsed.success) throw new AsrError(`火山引擎返回的结构和预期不同：${parsed.error.message.slice(0, 300)}`);
      return toTranscript(parsed.data);
    },
  };
}

/** 毫秒 → 秒；没有逐字时间的句子按字数平均分配 */
export function toTranscript(r: z.infer<typeof Response>): Transcript {
  const words: Word[] = [];
  const sentences: Sentence[] = [];
  for (const u of r.result.utterances ?? []) {
    const from = words.length;
    const ws = (u.words ?? []).filter((w) => w.start_time >= 0 && w.end_time >= w.start_time && w.text.trim());
    if (ws.length) {
      for (const w of ws) words.push({ text: w.text, start: w.start_time / 1000, end: w.end_time / 1000 });
    } else {
      const chars = [...u.text.replace(/[，。！？、,.!?\s]/g, "")];
      const step = (u.end_time - u.start_time) / 1000 / Math.max(chars.length, 1);
      chars.forEach((c, i) => words.push({ text: c, start: u.start_time / 1000 + i * step, end: u.start_time / 1000 + (i + 1) * step }));
    }
    if (words.length > from) sentences.push({ text: u.text, start: u.start_time / 1000, end: u.end_time / 1000, from, to: words.length });
  }
  const duration = (r.audio_info?.duration ?? 0) / 1000;
  return normalizeTranscript({ duration, words, sentences });
}
