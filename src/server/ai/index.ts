import type { z } from "zod";
import { extractJson } from "./json";
import { loadPrompt, render } from "./prompts";
import { createAnthropicProvider } from "./providers/anthropic";
import { createFakeProvider } from "./providers/fake";
import { createOpenAiCompatibleProvider } from "./providers/openai-compatible";
import { AiError, type AiProvider } from "./types";

export { AiError } from "./types";
export type { AiProvider } from "./types";

const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

/** 根据环境变量创建提供方。模型名和密钥都不写死。 */
export function providerFromEnv(env: Record<string, string | undefined> = process.env): AiProvider {
  const name = env.AI_PROVIDER ?? "fake";
  const model = env.AI_MODEL?.trim();
  if (name === "fake") return createFakeProvider();
  if (!model) throw new AiError(`AI_PROVIDER=${name} 时必须设置 AI_MODEL`);
  switch (name) {
    case "anthropic": {
      const effort = EFFORTS.find((e) => e === env.AI_EFFORT);
      return createAnthropicProvider({ model, apiKey: env.ANTHROPIC_API_KEY || undefined, effort });
    }
    case "openai":
      return createOpenAiCompatibleProvider({
        name: "openai",
        baseUrl: env.OPENAI_BASE_URL ?? "https://api.openai.com/v1",
        apiKey: env.OPENAI_API_KEY,
        model,
      });
    case "qwen":
      return createOpenAiCompatibleProvider({
        name: "qwen",
        baseUrl: env.DASHSCOPE_BASE_URL ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
        apiKey: env.DASHSCOPE_API_KEY,
        model,
      });
    default:
      throw new AiError(`不认识的 AI_PROVIDER：${name}（可选 anthropic / openai / qwen / fake）`);
  }
}

let cached: AiProvider | undefined;
export function defaultProvider(): AiProvider {
  return (cached ??= providerFromEnv());
}

export type TaskResult<T> = { data: T; prompt: { name: string; version: number }; provider: string; model: string };

/**
 * 跑一个提示词任务：读版本化提示词 → 填变量 → 调模型 → 取 JSON → zod 校验。
 * 输出格式不对时把错误告诉模型重试一次。
 */
export async function runTask<S extends z.ZodType>(
  name: string,
  vars: Record<string, string>,
  schema: S,
  opts: { provider?: AiProvider; maxTokens?: number } = {},
): Promise<TaskResult<z.infer<S>>> {
  const provider = opts.provider ?? defaultProvider();
  const prompt = loadPrompt(name);
  const system = render(prompt.system, vars);
  let user = render(prompt.user, vars);

  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const text = await provider.complete({ task: name, system, user, maxTokens: opts.maxTokens });
    try {
      const data = schema.parse(extractJson(text));
      return { data, prompt: { name, version: prompt.version }, provider: provider.name, model: provider.model };
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      user = `${user}\n\n上一次的输出不符合要求：${lastError.slice(0, 500)}\n请严格按要求的 JSON 结构重新输出。`;
    }
  }
  throw new AiError(`任务 ${name} 两次输出都不符合格式：${lastError.slice(0, 300)}`);
}

/**
 * 跑一个输出纯文字的任务（长文润色这类，放进 JSON 容易出转义问题）。
 * 去掉模型偶尔包上的代码块；输出为空时重试一次。
 */
export async function runTextTask(
  name: string,
  vars: Record<string, string>,
  opts: { provider?: AiProvider; maxTokens?: number } = {},
): Promise<TaskResult<string>> {
  const provider = opts.provider ?? defaultProvider();
  const prompt = loadPrompt(name);
  const system = render(prompt.system, vars);
  const user = render(prompt.user, vars);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await provider.complete({ task: name, system, user, maxTokens: opts.maxTokens });
    const text = raw.trim().replace(/^```[a-z]*\n?([\s\S]*?)\n?```$/i, "$1").trim();
    if (text) return { data: text, prompt: { name, version: prompt.version }, provider: provider.name, model: provider.model };
  }
  throw new AiError(`任务 ${name} 两次都没有输出内容`);
}
