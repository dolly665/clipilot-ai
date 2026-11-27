import { articleToMarkdown, type Article } from "./longform";
import type { PlatformKey } from "./platforms";

/** 派生成品的种类和内容结构 */
export type DerivativeContent =
  | { kind: "longform"; article: Article }
  | { kind: "zhihu_article"; question: string; article: Article }
  | { kind: "zhihu_idea"; text: string }
  | { kind: "post"; title?: string; text: string; tags?: string[] }
  | { kind: "podcast"; title: string; shownotes: string; durationSec: number };

export type DerivativeKind = DerivativeContent["kind"];

export const DERIVATIVE_LABEL: Record<DerivativeKind, string> = {
  longform: "公众号长文",
  zhihu_article: "知乎文章",
  zhihu_idea: "知乎想法",
  post: "短帖",
  podcast: "播客音频",
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
};

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
      return [c.title, c.text, c.tags?.map((t) => `#${t}`).join(" ")].filter(Boolean).join("\n\n");
    case "podcast":
      return `${c.title}\n\n${c.shownotes}`;
  }
}

/** 一键复制 / 下载的文字（Markdown） */
export function derivativeCopyText(c: DerivativeContent): string {
  switch (c.kind) {
    case "longform":
      return articleToMarkdown(c.article);
    case "zhihu_article":
      return articleToMarkdown({ ...c.article, title: c.question });
    default:
      return derivativeText(c);
  }
}
