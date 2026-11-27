import type { Article } from "../longform";
import { DEFAULT_WECHAT_THEME, WECHAT_THEMES, type WechatThemeId } from "./themes";

export type RenderWechatOptions = {
  theme?: WechatThemeId;
  /** 文末一句，比如引导关注；不传就没有 */
  footer?: string;
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** 转义后把成对的 **…** 换成主题的加粗样式；落单的 ** 原样保留 */
function inline(text: string, strong: (html: string) => string): string {
  return esc(text).replace(/\*\*([^*\n]+?)\*\*/g, (_, inner: string) => strong(inner));
}

/**
 * Article → 公众号编辑器能直接粘贴的 HTML（全部行内样式）。
 * 只管样式，不改文字：段落内容逐字输出，只多出 **加粗** 的样式。
 */
export function renderWechatHtml(article: Article, opts: RenderWechatOptions = {}): string {
  const t = WECHAT_THEMES[opts.theme ?? DEFAULT_WECHAT_THEME];
  const s = (x: string) => inline(x, t.strong);
  const parts: string[] = [];
  if (article.lead) parts.push(t.lead(s(article.lead)));
  let n = 0;
  for (const b of article.blocks) {
    if (b.type === "heading") parts.push(t.heading(s(b.text), ++n));
    else if (b.type === "quote") parts.push(t.quote(s(b.text)));
    else parts.push(t.paragraph(s(b.text)));
  }
  if (opts.footer) parts.push(t.footer(s(opts.footer)));
  return `<section style="${t.wrap}">${parts.join("")}</section>`;
}
