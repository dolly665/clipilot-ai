# 共享记忆（所有会话共用）

清清项目里的每个 Claude 会话，开工前先读这份和 `TASKS.md`，收工前把新结论写回来。
`CLAUDE.md` 写的是不变的规则，`HANDOFF.md` 写的是需求；这份只记**做的过程中新定下来的事**。

## 会话分工

| 代号 | 会话标题 | 分支 | 负责范围 |
|---|---|---|---|
| A · 开发 | 清清项目第一阶段规划 | `claude/admiring-clarke-2azzvz` | 视频线（上传、粗剪、ASR、音频）和设置页；共用的底层（`src/server/ai/`、`prisma/` 结构）改动前先在 TASKS.md 打招呼 |
| B · 文字与发布 | 公众号排版模板 | `ccr-64e9f40c-r2a7v6` | 文字输入线：底稿、润色、长文排版、图文成品（`prompts/polish/`、`src/domain/polish/`、`src/domain/wechat/`、`templates/`、`.claude/skills/wechat-layout/`，以及底稿和文本流水线相关代码）；发布流程：审核、批准、发布中心、PublishJob。A 不再改这些 |

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
- 2026-11-27 A：用户确认：国内账号（含小宇宙、喜马拉雅播客）叫「允安」，海外叫「时予清」，清清界面称呼不改。代码里统一用 `src/domain/brand.ts` 的 `accountName(region)`；图卡署名按平台区域取；提示词出了新版本（understand v2、short-posts v3、spoken-article v2、shownotes v2），旧版本保留。
- 2026-11-27 A：进度快照：第一阶段约七成。可用：长文字（底稿 → 公众号/知乎/小红书图文/公众号贴图/微博/YouTube 社区帖，含图卡和富文本复制）、音频（识别 → 三档粗剪逐刀恢复 → 播客音频/节目说明/长文/知乎）、合规拦截、审核批准。未做：视频（第 5 步）、设置页（第 6 步）。**全部只用假 AI / 假识别测过**，还没接真模型和火山引擎。下一步建议先用真模型验证润色效果，再定先做视频还是先调文字线；等用户选。
- 2026-11-27 A：用户的优先级：先要「长文字（多为录音转写）→ 理顺润色成底稿进底稿库 → 各图文平台直接能发」这条线；底稿要能在清清里看、改、留版本；图文要自动出图卡。
- 2026-11-27 A：开发环境注意：这个云端会话连不上火山引擎（www.volcengine.com、openspeech.bytedance.com 被网络策略拦截），本地无头浏览器下载中文文件名会显示成 download（只是测试环境现象，真实浏览器正常）。
- 2026-11-27 A：加了「取消这条」：已批准或已在发布的内容之外，任何阶段都能取消，删掉记录（底稿、成品、发布任务）和数据目录里的原件、中间文件、成品。这是用户主动删除，不违反「原始素材不改」。后台任务碰到已删的记录不再写回。
- 2026-11-27 A：用户本机用 DeepSeek（AI_PROVIDER=openai + OPENAI_BASE_URL）。修了一个 bug：OpenAI 兼容接口原来对所有任务都强制 JSON 输出，润色这种纯文字任务被 DeepSeek 拒绝；现在 `CompleteRequest.format` 区分 json / text。
- 2026-11-27 A：用户把「文字输入和发布流程」交给新会话 C。A 接着做视频（第 5 步）和设置页（第 6 步）。视频逻辑尽量放在新文件 `src/server/video.ts`、`src/domain/subtitles.ts`，`sources.ts` 里只加入口，减少和 C 冲突；内容库详情页只加「视频」区块。
- 2026-11-27 A：视频（第 5 步）完成第一版。成品种类新增 video（clean 无字幕 / burned 字幕烧进画面）、subtitle、cover、video_copy（每个视频平台一条，发布任务按平台挂）。烧字幕：竖屏全部、横屏只给视频号；B站和 YouTube 用无字幕版 + SRT。字体从 SUBTITLE_FONT 读，默认微软雅黑。为此在 C 范围内改了两处小地方：`syncJobs` 按平台匹配成品（`isPerPlatform`），下载接口的文件名。
- 2026-11-27 B：用户说本机测试的润色效果不好，把润色改派给 B。B 出了 polish v3（用「转写原文 → 认可版」三组对照做示例；口头词只留一半左右；合并转写工具在停顿处乱加的句号），加了转写导出稿清理 `cleanTranscriptExport`（去 AI 摘要、免责声明、说话人时间行）和评测脚本 `scripts/polish-eval.ts`。`polishText` 本身（`src/server/ai/tasks.ts`）仍归 A。
- 2026-11-27 B：**文字处理统一用 DeepSeek**（用户原话「文字这块处理你以后都用deepseek就行」；之前本机用的是豆包）。配置：`AI_PROVIDER=openai`、`AI_MODEL=deepseek-chat`、`OPENAI_BASE_URL=https://api.deepseek.com/v1`。云端会话的 DeepSeek 密钥存在环境的网络密钥里，由代理注入，`OPENAI_API_KEY` 填占位符 `proxy-injected` 即可。
- 2026-11-27 B：DeepSeek 润色实测（样本 xiuxing，和认可版对比）：v2 平均每段 82 字、相似度 0.74；v3 73 字、0.76；v4 48 字、0.82；v4 + 每块 800 字 45 字、0.83，而且「然后」减半（日常样本 29 → 14 处）。结论：用 v4，润色分块调小到 800 字左右。DeepSeek 偏保守，口头词仍比认可版多。
- 2026-11-27 B：用户确认「文字输入和发布流程交给另一个 session」指的就是 B。原来的 C 行并入 B：B 负责文字线（底稿、润色、排版、图文成品）和发布流程；A 只做视频和设置页。
- 2026-11-27 B：用户确认日常修行那版（带小标题的）是认可的润色，存为 `templates/voice/samples/richang.approved.txt`（去掉了小标题和末尾 AI 声明）。用这篇没进示例的样本检验：deepseek-chat 怎么写提示词都删得不够（相似度 0.69–0.71，篇幅 90%+，认可版 75%）；deepseek-reasoner + polish v6 到 0.74、篇幅 85%，「然后」「嘛」基本删光。结论：**润色用 `POLISH_MODEL=deepseek-reasoner`**，其他文字任务仍用 deepseek-chat。用户的风格比我们原先以为的删得更狠：嘛/呢/吧/然后几乎全删，「就是」「这个」留三分之一。
