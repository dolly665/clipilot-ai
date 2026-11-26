import Anthropic from "@anthropic-ai/sdk";
import { AiError, type AiProvider, type CompleteRequest } from "../types";

type Effort = "low" | "medium" | "high" | "xhigh" | "max";

/** 这些型号支持服务端拒答兜底（fallbacks: "default"） */
const SUPPORTS_FALLBACKS = /^claude-(fable-5|opus-5|sonnet-5-5)/;

export function createAnthropicProvider(opts: { model: string; apiKey?: string; effort?: Effort }): AiProvider {
  // 不传 apiKey 时 SDK 自己从环境读（ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / ant 登录）
  const client = new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
  const useFallbacks = SUPPORTS_FALLBACKS.test(opts.model);

  return {
    name: "anthropic",
    model: opts.model,
    async complete(req: CompleteRequest) {
      try {
        // 长文生成可能较长，用流式 + finalMessage 避免请求超时
        const stream = client.beta.messages.stream({
          model: opts.model,
          max_tokens: req.maxTokens ?? 16000,
          system: req.system,
          messages: [{ role: "user", content: req.user }],
          ...(opts.effort ? { output_config: { effort: opts.effort } } : {}),
          ...(useFallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
        });
        const msg = await stream.finalMessage();
        if (msg.stop_reason === "refusal") {
          throw new AiError(`模型拒绝了这次请求（${msg.stop_details?.category ?? "未说明原因"}）`);
        }
        if (msg.stop_reason === "max_tokens") throw new AiError("输出超过长度上限，被截断");
        return msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
      } catch (e) {
        if (e instanceof AiError) throw e;
        if (e instanceof Anthropic.AuthenticationError) throw new AiError("Anthropic 密钥无效或未配置", e);
        if (e instanceof Anthropic.RateLimitError) throw new AiError("Anthropic 限流，请稍后重试", e);
        if (e instanceof Anthropic.APIError) throw new AiError(`Anthropic 接口错误 ${e.status}: ${e.message}`, e);
        throw new AiError(`调用 Anthropic 失败：${String(e)}`, e);
      }
    },
  };
}
