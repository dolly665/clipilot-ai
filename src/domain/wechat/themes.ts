/**
 * 公众号排版主题。版式从用户给的 4 篇参考文章里提炼，配色统一换成侘寂风（见 templates/wechat/README.md）。
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
  /** 文末引导关注 */
  footer: (html: string) => string;
};

/** 侘寂配色：暖墨、宣纸、苔、茶、赭、青灰，不用纯黑和高饱和色 */
export const ZEN = {
  ink: "#3E3A35", // 正文暖墨
  inkDeep: "#2F2B27", // 标题
  stone: "#9A958E", // 灰字、旁白
  paper: "#F4F0E8", // 宣纸底
  moss: "#7C8A6E", // 苔绿
  mossPale: "#E6E9DD", // 淡苔
  tea: "#8C7B68", // 茶褐
  clay: "#9C6B52", // 赭石
  mist: "#5F7470", // 青灰
  line: "#DCD5C9", // 细线
} as const;

const SANS = "-apple-system,BlinkMacSystemFont,'PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif";

/** 所有主题共用的文末：一截细线 + 居中小字，像一方落款 */
const zenFooter = (color: string) => (t: string) =>
  `<section style="margin:48px 8px 0;text-align:center;"><section style="width:32px;height:1px;margin:0 auto 18px;background:${ZEN.line};"></section><p style="margin:0;font-size:14px;line-height:2;letter-spacing:2px;color:${color};">${t}</p></section>`;

/** ① 资讯速报：淡苔色底做小标题，正文字距 1px、段距大，适合新闻汇总、多条短讯 */
const brief: WechatTheme = {
  id: "brief",
  name: "资讯速报",
  fits: "新闻汇总、一篇里有好几条独立短讯",
  wrap: `font-family:Optima-Regular,'PingFang SC',${SANS};`,
  lead: (t) => `<p style="margin:0 0 8px;font-size:14px;line-height:1.8;letter-spacing:1px;color:${ZEN.stone};text-align:left;">${t}</p>`,
  heading: (t) =>
    `<p style="margin:36px 0 24px;font-size:17px;line-height:2;font-weight:bold;color:${ZEN.inkDeep};"><span style="background:${ZEN.mossPale};padding:0.25em 10px;border-left:3px solid ${ZEN.moss};-webkit-box-decoration-break:clone;box-decoration-break:clone;">${t}</span></p>`,
  paragraph: (t) =>
    `<p style="margin:24px 0;font-size:16px;line-height:1.85;letter-spacing:1px;color:${ZEN.ink};text-align:justify;">${t}</p>`,
  quote: (t) =>
    `<p style="margin:24px 0;padding-left:12px;border-left:2px solid ${ZEN.moss};font-size:16px;line-height:1.85;letter-spacing:1px;font-weight:bold;color:${ZEN.moss};">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;color:${ZEN.inkDeep};">${t}</strong>`,
  footer: zenFooter(ZEN.stone),
};

/** ② 深度访谈：细线框导语、苔到沙的渐变线 + 居中青灰小标题、宣纸底金句，适合访谈、深度报道、科普 */
const interview: WechatTheme = {
  id: "interview",
  name: "深度访谈",
  fits: "访谈、问答、深度报道、知识科普",
  wrap: `font-family:${SANS};`,
  lead: (t) =>
    `<section style="margin:8px 8px 40px;padding:1.1em 1.2em;border:1px dashed ${ZEN.moss};font-size:14px;line-height:1.9;letter-spacing:1.5px;color:${ZEN.mist};text-align:justify;">${t}</section>`,
  heading: (t) =>
    `<section style="display:flex;margin:44px 0 0;"><section style="width:50%;height:3px;background:linear-gradient(to right,#C9D1BE,#FFFFFF);"></section><section style="width:50%;height:3px;background:linear-gradient(to left,#E2D6C3,#FFFFFF);"></section></section><p style="margin:16px 8px 24px;font-size:16px;line-height:1.8;letter-spacing:2px;font-weight:bold;color:${ZEN.mist};text-align:center;">${t}</p>`,
  paragraph: (t) =>
    `<p style="margin:0 8px 24px;font-size:16px;line-height:1.85;color:${ZEN.ink};text-align:justify;">${t}</p>`,
  quote: (t) =>
    `<section style="margin:0 8px 24px;padding:20px;background:${ZEN.paper};border-radius:0 10px 10px 10px;font-size:15px;line-height:1.9;letter-spacing:1px;font-weight:bold;color:${ZEN.tea};text-align:justify;">${t}</section>`,
  strong: (t) => `<strong style="font-weight:bold;color:${ZEN.mist};">${t}</strong>`,
  footer: zenFooter(ZEN.mist),
};

/** ③ 心得长文：墨色底、宣纸色字带序号的小标题，正文干净、留白多，适合个人观点、经验分享、清单体 */
const essay: WechatTheme = {
  id: "essay",
  name: "心得长文",
  fits: "个人观点、经验分享、「N 条心得」这类清单体长文",
  wrap: `font-family:${SANS};`,
  lead: (t) => `<p style="margin:0 8px 24px;font-size:16px;line-height:1.8;color:${ZEN.ink};">${t}</p>`,
  heading: (t, n) =>
    `<p style="margin:48px 8px 24px;font-size:17px;line-height:1.8;"><span style="background-color:${ZEN.inkDeep};color:${ZEN.paper};font-weight:bold;letter-spacing:1px;padding:3px 8px;">${n}、${t}</span></p>`,
  paragraph: (t) => `<p style="margin:0 8px 24px;font-size:16px;line-height:1.8;color:${ZEN.ink};">${t}</p>`,
  quote: (t) => `<p style="margin:0 8px 24px;font-size:17px;line-height:1.8;letter-spacing:1px;font-weight:bold;color:${ZEN.tea};">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;color:${ZEN.inkDeep};">${t}</strong>`,
  footer: zenFooter(ZEN.tea),
};

/** ④ 碎碎念：段距紧凑、下划线小标题、赭石色重点、灰色小字旁白，适合聊天口吻的随笔、近况、通知 */
const chat: WechatTheme = {
  id: "chat",
  name: "碎碎念",
  fits: "聊天口吻的随笔、近况更新、社群通知",
  wrap: `font-family:${SANS};`,
  lead: (t) => `<p style="margin:0 8px 8px;font-size:14px;line-height:1.8;letter-spacing:1px;color:${ZEN.stone};text-align:center;">${t}</p>`,
  heading: (t) =>
    `<p style="margin:28px 8px 6px;font-size:16px;line-height:1.8;letter-spacing:1px;font-weight:bold;color:${ZEN.inkDeep};"><span style="border-bottom:1px solid ${ZEN.clay};padding-bottom:2px;">${t}</span></p>`,
  paragraph: (t) => `<p style="margin:0 8px 6px;font-size:16px;line-height:1.8;letter-spacing:1px;color:${ZEN.ink};text-align:justify;">${t}</p>`,
  quote: (t) => `<p style="margin:10px 8px;font-size:16px;line-height:1.8;letter-spacing:1px;font-weight:bold;color:${ZEN.clay};">${t}</p>`,
  strong: (t) => `<strong style="font-weight:bold;color:${ZEN.clay};">${t}</strong>`,
  footer: zenFooter(ZEN.stone),
};

export const WECHAT_THEMES: Record<WechatThemeId, WechatTheme> = { brief, interview, essay, chat };
export const DEFAULT_WECHAT_THEME: WechatThemeId = "essay";

/** 国内账号统一叫「允安」；文末默认引导关注。传 footer: "" 可以去掉 */
export const DEFAULT_WECHAT_FOOTER = "我是允安<br>愿你被温柔以待，也能自在生长<br>喜欢的话，点个「在看」，我们下次见";
