import { afterEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectCuts } from "@/domain/roughcut";
import { asrFromEnv } from "./index";
import { createFakeAsr } from "./fake";
import { createVolcengineAsr, toTranscript } from "./volcengine";

afterEach(() => vi.unstubAllGlobals());

describe("fake ASR", () => {
  it("返回带口误的稿子，各类刀都能检测到", async () => {
    const t = await createFakeAsr().transcribe("x.mp3");
    const reasons = new Set(detectCuts(t, "standard").map((c) => c.reason));
    expect([...reasons].sort()).toEqual(["filler", "pause", "repeat", "retake"]);
  });
  it("按音频时长截断", async () => {
    const t = await createFakeAsr().transcribe("x.mp3", { durationSec: 5 });
    expect(t.duration).toBe(5);
    expect(t.words.every((w) => w.end <= 5)).toBe(true);
  });
});

describe("volcengine", () => {
  it("毫秒换算成秒，丢掉无效时间的词", () => {
    const t = toTranscript({
      audio_info: { duration: 3000 },
      result: {
        utterances: [
          { text: "大家好。", start_time: 100, end_time: 900, words: [
            { text: "大", start_time: 100, end_time: 300 }, { text: "家", start_time: 300, end_time: 500 },
            { text: "好", start_time: 500, end_time: 900 }, { text: "。", start_time: -1, end_time: -1 },
          ] },
          { text: "今天", start_time: 1500, end_time: 1900 },
        ],
      },
    });
    expect(t.duration).toBe(3);
    expect(t.words.map((w) => w.text).join("")).toBe("大家好今天");
    expect(t.words[0]).toEqual({ text: "大", start: 0.1, end: 0.3 });
    expect(t.sentences.map((s) => s.text)).toEqual(["大家好。", "今天"]);
  });

  it("请求头和请求体符合约定；关闭语义顺滑", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-"));
    const file = path.join(dir, "a.mp3");
    fs.writeFileSync(file, "abc");
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body));
      expect(body.request.enable_ddc).toBe(false);
      expect(body.audio.data).toBe(Buffer.from("abc").toString("base64"));
      const h = init.headers as Record<string, string>;
      expect(h["X-Api-App-Key"]).toBe("app");
      expect(h["X-Api-Access-Key"]).toBe("key");
      return new Response(JSON.stringify({ audio_info: { duration: 1000 }, result: { utterances: [] } }), {
        headers: { "X-Api-Status-Code": "20000000" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const t = await createVolcengineAsr({ appId: "app", accessKey: "key" }).transcribe(file);
    expect(t.duration).toBe(1);
    expect(fetchMock.mock.calls[0]![0]).toContain("/api/v3/auc/bigmodel/recognize/flash");
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("接口返回错误状态码时报出原因", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { headers: { "X-Api-Status-Code": "45000001", "X-Api-Message": "invalid audio" } })));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "asr-"));
    fs.writeFileSync(path.join(dir, "a.mp3"), "x");
    await expect(createVolcengineAsr({ appId: "a", accessKey: "k" }).transcribe(path.join(dir, "a.mp3"))).rejects.toThrow(/45000001.*invalid audio/);
  });

  it("没配置密钥时报错", async () => {
    await expect(asrFromEnv({ ASR_PROVIDER: "volcengine" }).transcribe("x")).rejects.toThrow(/未配置/);
  });
});
