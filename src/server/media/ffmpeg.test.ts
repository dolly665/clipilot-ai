import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { extractSpeechAudio, makeTone, probe, renderAudioCut } from "./ffmpeg";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qingqing-media-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("ffmpeg", () => {
  it("识别音频、按片段剪辑、原文件不变", async () => {
    const src = path.join(dir, "tone.mp3");
    await makeTone(src, 10);
    const before = fs.readFileSync(src);
    const p = await probe(src);
    expect(p.hasAudio).toBe(true);
    expect(p.hasVideo).toBe(false);
    expect(p.duration).toBeCloseTo(10, 0);

    const out = path.join(dir, "cut.mp3");
    await renderAudioCut(src, [{ start: 0, end: 2 }, { start: 5, end: 8 }], out, { loudnorm: true });
    expect((await probe(out)).duration).toBeCloseTo(5, 0);
    expect(fs.readFileSync(src).equals(before)).toBe(true);
  });

  it("抽语音音轨为 16k 单声道", async () => {
    const src = path.join(dir, "tone2.mp3");
    await makeTone(src, 3);
    const out = path.join(dir, "speech.mp3");
    await extractSpeechAudio(src, out);
    expect((await probe(out)).duration).toBeCloseTo(3, 0);
  });

  it("片段为空时报错", async () => {
    await expect(renderAudioCut(path.join(dir, "x.mp3"), [], path.join(dir, "y.mp3"))).rejects.toThrow(/没有可保留/);
  });
});
