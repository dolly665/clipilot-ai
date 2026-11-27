import { transcriptFromSpec, type Transcript } from "@/domain/transcript";
import type { AsrProvider } from "./types";

/**
 * 不联网的假语音识别：不管音频是什么，都返回一段固定的口播稿，
 * 里面故意带停顿、口头禅、重复和说错重来，方便看粗剪效果。
 * 稿子按音频时长截断。
 */
const SCRIPT =
  "/大家好，我是时予清。/今天我们来聊一下。今天我们来聊一聊关系里的边界感。" +
  "很多人嗯不敢拒绝，是怕怕关系变差。_[那个]_其实清楚的边界，反而让关系更长久。/" +
  "我我_我自己也是这样过来的。以前别人找我帮忙，我总是说好。后来我发现，说好太多次，心里会委屈。/" +
  "所以所以我想分享一个小练习。先说感谢，再说你的难处，最后给一个替代方案。/" +
  "你可以试试看。我们下期见。//";

export function createFakeAsr(): AsrProvider {
  return {
    name: "fake",
    async transcribe(_audioPath, opts) {
      const full = transcriptFromSpec(SCRIPT);
      const limit = opts?.durationSec ?? full.duration;
      return truncate(full, limit);
    },
  };
}

function truncate(t: Transcript, limit: number): Transcript {
  if (t.duration <= limit) return { ...t, duration: limit };
  const words = t.words.filter((w) => w.end <= limit);
  const sentences = t.sentences.filter((s) => s.to <= words.length);
  return { duration: limit, words, sentences };
}
