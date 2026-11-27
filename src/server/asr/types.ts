import type { Transcript } from "@/domain/transcript";

export interface AsrProvider {
  readonly name: string;
  /** 识别一个本地音频文件，返回逐字时间戳（秒） */
  transcribe(audioPath: string, opts?: { durationSec?: number }): Promise<Transcript>;
}

export class AsrError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "AsrError";
  }
}
