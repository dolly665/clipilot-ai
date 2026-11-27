/** 用法：npx tsx .claude/skills/wechat-layout/render.ts article.json out.html [theme] [footer] */
import { readFileSync, writeFileSync } from "node:fs";
import { renderWechatHtml } from "../../../src/domain/wechat";
import type { WechatThemeId } from "../../../src/domain/wechat";

const [src, out, theme, footer] = process.argv.slice(2);
if (!src || !out) throw new Error("用法：render.ts article.json out.html [brief|interview|essay|chat] [文末一句]");
const article = JSON.parse(readFileSync(src, "utf8"));
const body = renderWechatHtml(article, { theme: theme as WechatThemeId | undefined, footer });
// 预览页：手机宽度；页面上一键复制富文本，粘进公众号后台即可
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${article.title}</title>
<body style="margin:0;background:#f2f2f2"><div style="max-width:430px;margin:0 auto;background:#fff;padding:20px 12px">
<button onclick="const r=document.createRange();r.selectNode(document.getElementById('a'));getSelection().removeAllRanges();getSelection().addRange(r);document.execCommand('copy');this.textContent='已复制，去公众号后台粘贴'" style="width:100%;padding:12px;margin-bottom:16px;border:0;border-radius:8px;background:#07C160;color:#fff;font-size:16px">复制排版</button>
<h1 style="font-size:22px;line-height:1.4;margin:0 8px 20px">${article.title}</h1><div id="a">${body}</div></div></body>`,
);
console.log(`已生成 ${out}`);
