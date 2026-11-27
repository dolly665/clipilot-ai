import { createFakeAsr } from "./fake";
import type { AsrProvider } from "./types";
import { createVolcengineAsr } from "./volcengine";

export { AsrError, type AsrProvider } from "./types";

/** 按环境变量选语音识别提供方；密钥不写死 */
export function asrFromEnv(env: Record<string, string | undefined> = process.env): AsrProvider {
  switch (env.ASR_PROVIDER ?? "fake") {
    case "fake":
      return createFakeAsr();
    case "volcengine":
      return createVolcengineAsr({
        appId: env.VOLC_ASR_APP_ID,
        accessKey: env.VOLC_ASR_ACCESS_KEY,
        resourceId: env.VOLC_ASR_RESOURCE_ID || undefined,
        baseUrl: env.VOLC_ASR_BASE_URL || undefined,
      });
    default:
      throw new Error(`不认识的 ASR_PROVIDER：${env.ASR_PROVIDER}（可选 volcengine / fake）`);
  }
}

let cached: AsrProvider | undefined;
export function defaultAsr(): AsrProvider {
  return (cached ??= asrFromEnv());
}
