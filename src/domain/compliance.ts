import { PLATFORMS, type PlatformKey } from "./platforms";
import { TOPICS, type Region, type Topic } from "./types";

/** 主题是否只能发海外（修行、玄学·法界） */
export function isOverseasOnlyTopic(topic: Topic): boolean {
  return TOPICS.find((t) => t.name === topic)?.region === "os";
}

export type SensitiveHit = { word: string; start: number; end: number };

/**
 * 在文本里找敏感词，返回每一处命中的位置（UTF-16 下标，可直接用于 String.slice 高亮）。
 * 长词优先：「因果报应」命中时不再重复报其中的短词。
 */
export function scanSensitive(text: string, words: readonly string[]): SensitiveHit[] {
  const sorted = [...new Set(words.map((w) => w.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  const taken = new Array<boolean>(text.length).fill(false);
  const hits: SensitiveHit[] = [];
  for (const word of sorted) {
    let from = 0;
    for (;;) {
      const start = text.indexOf(word, from);
      if (start < 0) break;
      const end = start + word.length;
      let overlaps = false;
      for (let i = start; i < end; i++) if (taken[i]) { overlaps = true; break; }
      if (!overlaps) {
        hits.push({ word, start, end });
        for (let i = start; i < end; i++) taken[i] = true;
      }
      from = start + 1;
    }
  }
  return hits.sort((a, b) => a.start - b.start);
}

export type BlockReason = "topic" | "sensitive";
export type PlatformDecision =
  | { key: PlatformKey; state: "on" }
  | { key: PlatformKey; state: "off"; why: "not_selected" | "region_off" | "tbd" }
  | { key: PlatformKey; state: "blocked"; why: BlockReason };

export type ComplianceInput = {
  topic: Topic;
  /** 用户（或 AI 预填）选的发布区域 */
  regions: readonly Region[];
  /** 用户勾选的平台 */
  selected: readonly PlatformKey[];
  /** 这条内容在哪些平台上可选 */
  available: readonly PlatformKey[];
  /** 转录稿 / 原文 / 生成文字里的敏感词命中 */
  hits: readonly SensitiveHit[];
};

/**
 * 最终每个平台的去向。硬规则：
 * - 只发海外的主题 → 所有国内平台拦截，用户不能重新打开；
 * - 有敏感词命中 → 所有国内平台拦截；
 * - 「以后再定」的平台不可选。
 */
export function decidePlatforms(input: ComplianceInput): PlatformDecision[] {
  const blockCn: BlockReason | null = isOverseasOnlyTopic(input.topic) ? "topic" : input.hits.length > 0 ? "sensitive" : null;
  return input.available.map((key): PlatformDecision => {
    const p = PLATFORMS[key];
    if (p.region === "cn" && blockCn) return { key, state: "blocked", why: blockCn };
    if ("tbd" in p && p.tbd) return { key, state: "off", why: "tbd" };
    if (!input.regions.includes(p.region)) return { key, state: "off", why: "region_off" };
    if (!input.selected.includes(key)) return { key, state: "off", why: "not_selected" };
    return { key, state: "on" };
  });
}

/** 预填区域：只发海外的主题或有敏感词 → 只勾海外，否则国内 + 海外 */
export function defaultRegions(topic: Topic, hits: readonly SensitiveHit[]): Region[] {
  return isOverseasOnlyTopic(topic) || hits.length > 0 ? ["os"] : ["cn", "os"];
}

/** 原型里的默认国内敏感词库，用于首次初始化数据库；之后以设置页为准 */
export const DEFAULT_SENSITIVE_WORDS = [
  "烧纸", "法界", "玄学", "鬼", "阴间", "超度", "风水", "算命", "因果报应", "灵体", "附身", "冤亲债主",
] as const;
