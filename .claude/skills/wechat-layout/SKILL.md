---
name: wechat-layout
description: 把用户给的文章排成公众号格式（4 套主题：资讯速报、深度访谈、心得长文、碎碎念），输出能直接粘进公众号后台的 HTML 和手机预览。用户说「排版」「排一下」「发公众号」或直接贴一篇长文时使用。
---

# 公众号排版

规范见 `templates/wechat/README.md`，代码是 `src/domain/wechat/`（`renderWechatHtml`）。

## 步骤

1. **选主题**：用户指定了就用指定的；没指定按内容判断——多条新闻 → `brief`；访谈问答、科普 → `interview`；个人观点、经验、清单体 → `essay`（默认）；聊天口吻随笔、近况、通知 → `chat`。告诉用户选了哪个、为什么。
2. **整理成 Article JSON**，原文一个字不改：
   ```json
   { "title": "…", "lead": "开头导语，没有就空字符串",
     "blocks": [ {"type":"heading","text":"…"}, {"type":"paragraph","text":"…"}, {"type":"quote","text":"…"} ] }
   ```
   - 原文已有小标题就沿用；没有就每 3–6 段加一个 4–12 字的小标题。`essay` 主题会自动加「1、」，标题里不要自己写序号。
   - `quote` 只能是原文里的原句，全文 1–3 句，放在出处那段后面（原段落保留）。
   - 段落里可用 `**…**` 加粗重点，一段最多一处，全文 5 处左右。
   - 录音转写稿（口语、没标点）先问用户要不要润色；润色属于 A 会话的底稿流程，这里只排版。
3. **渲染**：JSON 写到草稿目录，然后
   `npx tsx .claude/skills/wechat-layout/render.ts <article.json> <out.html> <theme> "<文末一句>"`
   文末一句用户没给就省略。
4. **交付**：用 SendUserFile 把 out.html 发给用户（display: render）。页面顶部有「复制排版」按钮，复制后粘进公众号后台就行。用户要改主题或改某个标题，就改 JSON 重新渲染。
