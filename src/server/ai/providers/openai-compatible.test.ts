import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiCompatibleProvider } from "./openai-compatible";

type Body = { response_format?: unknown; messages: { role: string; content: string }[] };

function mockFetch() {
  const bodies: Body[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body) as Body);
    return new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 });
  }));
  return bodies;
}

const provider = () => createOpenAiCompatibleProvider({ name: "openai", baseUrl: "https://api.deepseek.com/v1", apiKey: "k", model: "deepseek-chat" });

afterEach(() => vi.unstubAllGlobals());

describe("OpenAI 兼容接口（DeepSeek 等）", () => {
  it("纯文字任务（润色）不要求 JSON", async () => {
    const bodies = mockFetch();
    await provider().complete({ task: "polish", system: "理顺口语", user: "原文", format: "text" });
    expect(bodies[0]!.response_format).toBeUndefined();
    expect(bodies[0]!.messages[0]!.content).toBe("理顺口语");
  });

  it("结构化任务要求 JSON；提示词里没写 json 时补一句", async () => {
    const bodies = mockFetch();
    await provider().complete({ task: "understand", system: "判断主题", user: "原文", format: "json" });
    expect(bodies[0]!.response_format).toEqual({ type: "json_object" });
    expect(bodies[0]!.messages[0]!.content).toMatch(/json/i);
  });
});
