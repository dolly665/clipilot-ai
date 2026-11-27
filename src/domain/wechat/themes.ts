/**
 * 公众号排版主题。样式从用户给的 4 篇参考文章里提炼（见 templates/wechat/README.md）。
 * 全部是行内样式字符串：公众号编辑器会删掉 <style> 和 class。
 */

export type WechatThemeId = "brief" | "interview" | "essay" | "chat";

export type WechatTheme = {
  id: WechatThemeId;
  name: string;
  /** 什么时候用 */
  fits: string;
  /** 最外层 section */
  wrap: string;
  /** 文章开头的导语 */
  lead: (html: string) => string;
  /** 小标题；n 从 1 开始 */
  heading: (html: string, n: number) => string;
  paragraph: (html: string) => string;
  /** 金句 */
  quote: (html: string) => string;
  /** 段落里 **加粗** 的部分 */
  strong: (html: string) => string;
  /** 文末一句（引导关注、署名等），可选 */
  footer: (html: string) => string;
};

const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/** ① 资讯速报：青绿色荧光块做小标题，正文字距 1px、段距大，适合新闻汇总、多条短讯 */
const brief: WechatTheme = {
  id: "brief",
  name: "资讯速报",
  fits: "新闻汇总、一篇里有好几条独立短讯",
  wrap: `font-family:Optima-Regular,'PingFang SC',${SANS};`,
  lead: (t) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.6;color:#888;text-align:left;">${t}</p>`,
  heading: (t) =>
    `<p style="margin:30px 0 25px;font-size:18px;line-height:2;font-weight:bold;color:#000;"><span style="background:#1DE8DD;padding:0.3em 10px;-webkit-box-decoration-break:clone;box-decoration-break:clone;">${t}</span></p>`,
  paragraph: (t) =>
    `<p style="margin:25px 0;font-size:16px;line-height:1.75;letter-spacing:1px;color:#000;text-align:justify;">${t}</p>`,
  quote: (t) =>
    `<p style="margin:25px 0;padding-left:12px;border-left:4px solid #1DE8DD;font-size:16px;line-height:1.75;letter-spacing:1px;font-weight:bold;color:#000;">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;">${t}</strong>`,
  footer: (t) =>
    `<p style="margin:40px 0 0;padding-top:12px;border-top:1px solid rgba(0,0,0,0.1);font-size:14px;line-height:1.6;color:#888;">${t}</p>`,
};

const BLUE = "#007AAA";
const gradientBar = `<section style="display:flex;margin:40px 0 0;"><section style="width:50%;height:5px;background:linear-gradient(to right,#B8DDFF,#FFFFFF);"></section><section style="width:50%;height:5px;background:linear-gradient(to left,#9AE9D2,#FFFFFF);"></section></section>`;

/** ② 深度访谈：虚线框导语、渐变线 + 居中蓝字小标题、浅蓝底金句，适合访谈、深度报道、科普 */
const interview: WechatTheme = {
  id: "interview",
  name: "深度访谈",
  fits: "访谈、问答、深度报道、知识科普",
  wrap: `font-family:${SANS};`,
  lead: (t) =>
    `<section style="margin:8px 8px 40px;padding:1em;border:2px dotted #9CC9C7;font-size:14px;line-height:1.75em;letter-spacing:1.5px;color:${BLUE};text-align:justify;">${t}</section>`,
  heading: (t) =>
    `${gradientBar}<p style="margin:16px 8px 24px;font-size:16px;line-height:1.75em;font-weight:bold;color:${BLUE};text-align:center;">${t}</p>`,
  paragraph: (t) =>
    `<p style="margin:0 8px 24px;font-size:16px;line-height:1.75em;color:#3F3F3F;text-align:justify;">${t}</p>`,
  quote: (t) =>
    `<section style="margin:0 8px 24px;padding:20px;background:#EEF4FC;border-radius:0 10px 10px 10px;font-size:15px;line-height:1.75em;letter-spacing:1px;font-weight:bold;color:${BLUE};text-align:justify;">${t}</section>`,
  strong: (t) => `<strong style="font-weight:bold;color:#3F3F3F;">${t}</strong>`,
  footer: (t) =>
    `<p style="margin:40px 8px 0;font-size:12px;line-height:1.75em;color:#888;text-align:center;">${t}</p>`,
};

/** ③ 心得长文：黑底白字带序号的小标题，正文干净、段距 24px，适合个人观点、经验分享、清单体 */
const essay: WechatTheme = {
  id: "essay",
  name: "心得长文",
  fits: "个人观点、经验分享、「N 条心得」这类清单体长文",
  wrap: `font-family:${SANS};`,
  lead: (t) => `<p style="margin:0 8px 24px;font-size:16px;line-height:1.6;color:#000;">${t}</p>`,
  heading: (t, n) =>
    `<p style="margin:48px 8px 24px;font-size:18px;line-height:1.6;"><span style="background-color:#000;color:#FFF;font-weight:bold;padding:2px 6px;">${n}、${t}</span></p>`,
  paragraph: (t) => `<p style="margin:0 8px 24px;font-size:16px;line-height:1.6;color:rgba(0,0,0,0.9);">${t}</p>`,
  quote: (t) => `<p style="margin:0 8px 24px;font-size:17px;line-height:1.6;font-weight:bold;color:#000;">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;">${t}</strong>`,
  footer: (t) => `<p style="margin:32px 8px 0;font-size:12px;line-height:1.6;color:#B2B2B2;">${t}</p>`,
};

const CRIMSON = "#AB1942";

/** ④ 碎碎念：段距紧凑、下划线小标题、玫红色重点、灰色小字旁白，适合聊天口吻的随笔、社群通知 */
const chat: WechatTheme = {
  id: "chat",
  name: "碎碎念",
  fits: "聊天口吻的随笔、近况更新、社群通知",
  wrap: `font-family:${SANS};`,
  lead: (t) => `<p style="margin:0 8px 8px;font-size:14px;line-height:1.75;letter-spacing:1px;color:#888;text-align:center;">${t}</p>`,
  heading: (t) =>
    `<p style="margin:24px 8px 4px;font-size:16px;line-height:1.75;letter-spacing:1px;font-weight:bold;color:#000;"><span style="text-decoration:underline;">${t}</span></p>`,
  paragraph: (t) => `<p style="margin:0 8px 4px;font-size:16px;line-height:1.75;letter-spacing:1px;color:#000;text-align:justify;">${t}</p>`,
  quote: (t) => `<p style="margin:8px 8px 8px;font-size:16px;line-height:1.75;letter-spacing:1px;font-weight:bold;color:${CRIMSON};">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;color:${CRIMSON};">${t}</strong>`,
  footer: (t) => `<p style="margin:24px 8px 0;font-size:14px;line-height:1.75;letter-spacing:1px;color:#888;text-align:center;">${t}</p>`,
};

export const WECHAT_THEMES: Record<WechatThemeId, WechatTheme> = { brief, interview, essay, chat };
export const DEFAULT_WECHAT_THEME: WechatThemeId = "essay";
