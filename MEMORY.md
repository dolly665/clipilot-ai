# 共享记忆（所有会话共用）

清清项目里的每个 Claude 会话，开工前先读这份和 `TASKS.md`，收工前把新结论写回来。
`CLAUDE.md` 写的是不变的规则，`HANDOFF.md` 写的是需求；这份只记**做的过程中新定下来的事**。

## 会话分工

| 代号 | 会话标题 | 分支 | 负责范围 |
|---|---|---|---|
| A · 开发 | 清清项目第一阶段规划 | `claude/admiring-clarke-2azzvz` | 清清应用本体：`src/`、`prompts/`、`prisma/`、`scripts/` 等，除下面 B 认领的文件 |
| B · 排版 | 公众号排版模板 | `ccr-64e9f40c-r2a7v6` | 公众号排版：`templates/wechat/`、`src/domain/wechat/`、`.claude/skills/wechat-layout/`；用户语气样本 `templates/voice/` |

- 只改自己范围里的文件。要动对方的文件，先在 `TASKS.md` 里写一条请求，交给对方做，或者等用户指派。
- 范围变了（比如用户把一件事改派给另一个会话），由接手的会话改上面这张表。
- 会话 ID 和分支以 `git branch -a` 和会话列表为准；有新会话加入就加一行。

## 同步规则

1. 开工前：`git fetch origin`，把对方的分支合并进来（`git merge origin/<对方分支>`），再读这份和 `TASKS.md`。
2. 改 `MEMORY.md` 只在末尾追加，不改别人写的行；改 `TASKS.md` 只改自己那几行。这样合并基本不会冲突。
3. 收工前：提交并推送自己的分支，必要时用会话消息告诉对方「我推了什么、你需要合并什么」。
4. 两个分支以后由用户决定什么时候合并到 `main`。

## 用户偏好

- 用中文交流；回答要简洁，直接给结论。
- 用户在手机（Android）和桌面端之间切换使用。
- 仓库现在就是「清清」（原 clipilot-ai），GitHub 上的改名由用户自己在仓库设置里做。

## 决定记录（只追加，写日期和会话代号）

- 2026-11-27 B：公众号排版做成「Article 块 → 带行内样式的 HTML」的渲染器，放在 `src/domain/wechat/`，接在 A 已有的 `src/domain/longform.ts`（`Article` / `ArticleBlock`）后面。A 那边的 `Article` 类型如果要改，先告诉 B。
- 2026-11-27 B：公众号编辑器会删掉 `<style>` 和 class，所以所有样式必须写在元素的 `style` 属性里。
- 2026-11-27 A：公众号「复制富文本」按钮已上线，暂用 A 的临时实现 `articleToWechatHtml`（`src/domain/longform.ts`）。B 的渲染器完成后改接 B 的，删掉临时实现；在那之前 A 不再扩展这个临时实现的样式。
- 2026-11-27 A：长文本现在先出「底稿」（AI 判断转写稿要润色、成稿原样保留，用户编辑确认后存版本），各平台成品都从底稿生成。`Article` 类型目前没有改动计划。
- 2026-11-27 B：公众号排版有 4 套主题（`brief` 资讯速报 / `interview` 深度访谈 / `essay` 心得长文 / `chat` 碎碎念），默认 `essay`，等用户确认。渲染器 `renderWechatHtml(article, { theme, footer })` 支持段落里的 `**加粗**`。
- 2026-11-27 A：公众号「复制富文本」已改用 B 的 `renderWechatHtml`，审核页可选四个主题，上次选择记在浏览器 localStorage；`articleToWechatHtml` 已删除。默认主题仍是 essay，等用户定。
- 2026-11-27 B：用户要求公众号配色改成禅意侘寂风、自然和谐；4 套主题已全部换色（色板见 `templates/wechat/README.md`，代码里是 `ZEN`）。
- 2026-11-27 B：**国内账号统一叫「允安」**（海外仍是时予清）。公众号文末默认加允安的引导关注（`DEFAULT_WECHAT_FOOTER`），`renderWechatHtml` 不传 footer 就自动带上。
- 2026-11-27 B：用户给了一份录音转写稿和认可的润色版，语气要点和同音错字表记在 `templates/voice/README.md`。润色时保留口头推进词和自问自答，只改错字、卡顿、标点、分段。
- 2026-11-27 A：润色提示词升到 v2（依据 `templates/voice/README.md`）：保留「那」「就是」「其实」等推进词，一段一到两句，问句单独成段，列举先单独一行做标签。同音错字表独立成 `prompts/polish/glossary.md`，发现新错字直接加一行，不用升版本。
