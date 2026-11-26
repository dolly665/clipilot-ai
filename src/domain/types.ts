/** 源素材种类：清清根据拖进来的文件自动识别 */
export const SOURCE_KINDS = ["video", "audio", "text"] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

/** 画幅。横屏、竖屏是分开录的，清清不做裁切。 */
export const ORIENTS = ["h", "v"] as const;
export type Orient = (typeof ORIENTS)[number];

export const CONTENT_TYPES = {
  talk: "纯口播",
  show: "口播 + B roll",
  screen: "录屏教学",
  vlog: "Vlog",
  audio: "音频 + B roll",
  text: "长文本",
} as const;
export type ContentType = keyof typeof CONTENT_TYPES;

export const REGIONS = ["cn", "os"] as const;
export type Region = (typeof REGIONS)[number];
export const REGION_LABEL: Record<Region, string> = { cn: "国内", os: "海外" };

/** 主题。region = "os" 的主题只发海外，国内平台一律关闭。 */
export const TOPICS = [
  { name: "AI 实操", region: "all" },
  { name: "心理学", region: "all" },
  { name: "人情世故", region: "all" },
  { name: "生活", region: "all" },
  { name: "修行", region: "os" },
  { name: "玄学·法界", region: "os" },
] as const;
export type Topic = (typeof TOPICS)[number]["name"];

export const ROUGH_CUT_LEVELS = { conservative: "保守", standard: "标准", tight: "紧凑" } as const;
export type RoughCutLevel = keyof typeof ROUGH_CUT_LEVELS;

/** 每条成品在每个平台一条发布任务的状态（HANDOFF §6） */
export const PUBLISH_STATUS = {
  pending_review: "待审",
  approved: "已批准",
  queued: "排队",
  uploading: "上传中",
  awaiting_click: "待你点发布",
  published: "已发布",
  failed: "失败",
  compliance_blocked: "合规拦截",
} as const;
export type PublishStatus = keyof typeof PUBLISH_STATUS;

export function isTopic(x: string): x is Topic {
  return TOPICS.some((t) => t.name === x);
}
