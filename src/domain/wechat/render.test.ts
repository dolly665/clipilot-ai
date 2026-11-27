import { describe, expect, it } from "vitest";
import type { Article } from "../longform";
import { renderWechatHtml, WECHAT_THEMES, type WechatThemeId } from ".";

const article: Article = {
  title: "边界感",
  lead: "写在前面的一句话",
  blocks: [
    { type: "heading", text: "先说结论" },
    { type: "paragraph", text: "边界感不是冷漠，是**清楚自己要什么**。<script>" },
    { type: "quote", text: "你可以善良，但要有锋芒。" },
    { type: "heading", text: "怎么做" },
    { type: "paragraph", text: "第二段 a ** b" },
  ],
};

describe("renderWechatHtml", () => {
  for (const id of Object.keys(WECHAT_THEMES) as WechatThemeId[]) {
    it(`${id}: 只用行内样式，内容逐字保留`, () => {
      const html = renderWechatHtml(article, { theme: id, footer: "关注时予清" });
      expect(html).not.toMatch(/<style|class=|<script>/);
      expect(html).toContain("&lt;script&gt;");
      for (const s of ["写在前面的一句话", "先说结论", "你可以善良，但要有锋芒。", "怎么做", "第二段 a ** b", "关注时予清"]) {
        expect(html).toContain(s);
      }
      expect(html).toMatch(/<strong style="[^"]+">清楚自己要什么<\/strong>/);
    });
  }

  it("心得长文给小标题自动编号", () => {
    const html = renderWechatHtml(article, { theme: "essay" });
    expect(html).toContain("1、先说结论");
    expect(html).toContain("2、怎么做");
  });

  it("默认文末是允安的引导，footer 传空字符串就不要", () => {
    const html = renderWechatHtml(article, { theme: "chat" });
    expect(html).toContain("我是允安<br>");
    expect(renderWechatHtml(article, { footer: "" })).not.toContain("允安");
  });

  it("不用纯黑和高饱和的颜色", () => {
    for (const id of Object.keys(WECHAT_THEMES) as WechatThemeId[]) {
      expect(renderWechatHtml(article, { theme: id })).not.toMatch(/#000\b|#000000|rgb\(0, ?0, ?0\)|#1DE8DD|#007AAA|#AB1942/i);
    }
  });
});
