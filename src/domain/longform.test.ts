import { describe, expect, it } from "vitest";
import { articleParagraphs, articleToMarkdown, assembleArticle, splitParagraphs } from "./longform";

const TEXT = "第一段，讲结论。\n\n第二段：边界感不是冷漠。\r\n第三段。\n\n\n第四段收尾。";

describe("longform", () => {
  it("切段：兼容各种换行，丢弃空段", () => {
    expect(splitParagraphs(TEXT)).toEqual(["第一段，讲结论。", "第二段：边界感不是冷漠。", "第三段。", "第四段收尾。"]);
  });

  it("组装后的段落与原文逐字一致，顺序不变", () => {
    const ps = splitParagraphs(TEXT);
    const a = assembleArticle(ps, {
      title: "标题",
      lead: "导语",
      headings: [{ before: 0, text: "开头" }, { before: 2, text: "中间" }],
      quotes: ["边界感不是冷漠"],
    });
    expect(articleParagraphs(a)).toEqual(ps);
    expect(a.blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "paragraph", "quote", "heading", "paragraph", "paragraph"]);
  });

  it("丢弃越界的小标题和不是原文的金句", () => {
    const ps = splitParagraphs(TEXT);
    const a = assembleArticle(ps, {
      title: "t",
      lead: "",
      headings: [{ before: 99, text: "越界" }],
      quotes: ["原文里没有这句", "第三段", "第三段"],
    });
    expect(a.blocks.filter((b) => b.type === "heading")).toHaveLength(0);
    expect(a.blocks.filter((b) => b.type === "quote").map((b) => b.text)).toEqual(["第三段"]);
  });

  it("Markdown 输出", () => {
    const a = assembleArticle(["一段"], { title: "T", lead: "L", headings: [{ before: 0, text: "H" }], quotes: [] });
    expect(articleToMarkdown(a)).toBe("# T\n\n> L\n\n## H\n\n一段\n");
  });
});

import { articleToWechatHtml } from "./longform";
describe("articleToWechatHtml", () => {
  it("只用内联样式，转义特殊字符", () => {
    const html = articleToWechatHtml({ title: "T", lead: "导语<b>", blocks: [{ type: "heading", text: "小标题" }, { type: "paragraph", text: "a & b" }, { type: "quote", text: "金句" }] });
    expect(html).not.toContain("class=");
    expect(html).toContain("导语&lt;b&gt;");
    expect(html).toContain("a &amp; b");
    expect(html).toMatch(/<h2 style="[^"]+">小标题<\/h2>/);
    expect(html).toContain("<blockquote");
  });
});
