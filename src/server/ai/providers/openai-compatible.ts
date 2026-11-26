import { AiError, type AiProvider, type CompleteRequest } from "../types";

/**
 * OpenAI 与通义千问（DashScope 兼容模式）共用的 Chat Completions 调用。
 * 从旧版 legacy/index.html 的 openaiCall / qwenCall 改写成服务端版本。
 */
export function createOpenAiCompatibleProvider(opts: {
  name: "openai" | "qwen";
  baseUrl: string;
  apiKey: string | undefined;
  model: string;
}): AiProvider {
  return {
    name: opts.name,
    model: opts.model,
    async complete(req: CompleteRequest) {
      if (!opts.apiKey) throw new AiError(`${opts.name} 密钥未配置`);
      const res = await fetch(`${opts.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
        body: JSON.stringify({
          model: opts.model,
          max_tokens: req.maxTokens ?? 8000,
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string; error?: { message?: string } };
        throw new AiError(`${opts.name} 接口错误 ${res.status}: ${body.error?.message ?? body.message ?? ""}`);
      }
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new AiError(`${opts.name} 返回为空`);
      return text;
    },
  };
}
