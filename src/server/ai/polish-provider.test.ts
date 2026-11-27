import { describe, expect, it } from "vitest";
import { polishProvider } from "./tasks";

describe("polishProvider", () => {
  it("没设 POLISH_MODEL 或用假数据时不单独建提供方", () => {
    expect(polishProvider({ AI_PROVIDER: "openai", AI_MODEL: "deepseek-chat" })).toBeUndefined();
    expect(polishProvider({ AI_PROVIDER: "fake", POLISH_MODEL: "deepseek-reasoner" })).toBeUndefined();
  });
  it("设了 POLISH_MODEL 就用同一个提供方的那个模型", () => {
    const p = polishProvider({ AI_PROVIDER: "openai", AI_MODEL: "deepseek-chat", POLISH_MODEL: "deepseek-reasoner", OPENAI_BASE_URL: "https://api.deepseek.com/v1", OPENAI_API_KEY: "x" });
    expect(p?.model).toBe("deepseek-reasoner");
  });
});
