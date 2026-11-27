import { articleToMarkdown, type Article } from "./longform";
import type { PlatformKey } from "./platforms";

/** 派生成品的种类和内容结构 */
export type DerivativeContent =
  | { kind: "longform"; article: Article }
  | { kind: "zhihu_article"; question: string; article: Article }
  | { kind: "zhihu_idea"; text: string }
  | { kind: "post"; title?: string; text: string; tags?: string[]; cover?: { title: string; subtitle: string }; cards?: { title: string; body: string }[] }
  | { kind: "podcast"; title: string; shownotes: string; durationSec: number }
  /** 粗剪成片：clean 不带字幕（配 SRT 上传），burned 字幕烧进画面（竖屏、视频号） */
  | { kind: "video"; variant: "clean" | "burned"; orient: "h" | "v"; durationSec: number }
  | { kind: "subtitle"; cues: number }
  /** 封面候选帧（相对 DATA_DIR 的路径）和封面标题；叠字在页面上做 */
  | { kind: "cover"; frames: string[]; title: string; orient: "h" | "v"; /** 你在页面上选好帧、叠好标题后存下的封面（自动发布时用） */ png?: string }
  /** 某个视频平台的标题、简介、标签 */
  | { kind: "video_copy"; title: string; desc: string; tags: string[] };

export type DerivativeKind = DerivativeContent["kind"];

export const DERIVATIVE_LABEL: Record<DerivativeKind, string> = {
  longform: "公众号长文",
  zhihu_article: "知乎文章",
  zhihu_idea: "知乎想法",
  post: "短帖",
  podcast: "播客音频",
  video: "粗剪成片",
  subtitle: "字幕",
  cover: "封面",
  video_copy: "视频文案",
};

/** 每个平台的发布任务挂在哪种成品上 */
export const JOB_DERIVATIVE: Partial<Record<PlatformKey, DerivativeKind>> = {
  gzh: "longform",
  zhihu: "zhihu_article",
  gzhp: "post",
  xhsn: "post",
  wb: "post",
  ytc: "post",
  xyz: "podcast",
  xmly: "podcast",
  pod: "podcast",
  bili: "video_copy",
  sph: "video_copy",
  dy: "video_copy",
  xhs: "video_copy",
  yt: "video_copy",
  yts: "video_copy",
};

/** 这种成品按平台各一条（找发布任务挂哪条时要对上平台） */
export function isPerPlatform(kind: DerivativeKind): boolean {
  return kind === "post" || kind === "video_copy";
}

/** 用于合规扫描的全部文字 */
export function derivativeText(c: DerivativeContent): string {
  switch (c.kind) {
    case "longform":
      return articleToMarkdown(c.article);
    case "zhihu_article":
      return `${c.question}\n\n${articleToMarkdown({ ...c.article, title: c.question })}`;
    case "zhihu_idea":
      return c.text;
    case "post":
      return [
        c.title,
        c.text,
        c.tags?.map((t) => `#${t}`).join(" "),
        c.cover && `${c.cover.title}\n${c.cover.subtitle}`,
        ...(c.cards ?? []).map((k) => `${k.title}\n${k.body}`),
      ].filter(Boolean).join("\n\n");
    case "podcast":
      return `${c.title}\n\n${c.shownotes}`;
    case "video_copy":
      return [c.title, c.desc, c.tags.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
    case "cover":
      return c.title;
    case "video":
    case "subtitle":
      return "";
  }
}

/** 一键复制 / 下载的文字（Markdown） */
export function derivativeCopyText(c: DerivativeContent): string {
  switch (c.kind) {
    case "longform":
      return articleToMarkdown(c.article);
    case "zhihu_article":
      return articleToMarkdown({ ...c.article, title: c.question });
    case "post":
      // 复制的是要贴进发布框的文字；图卡单独下载
      return [c.title, c.text, c.tags?.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
    default:
      return derivativeText(c);
  }
}
