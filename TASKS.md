# 任务板

用户在两个会话之间派活，这里记谁在做什么。每个会话只改自己名下的行。
状态：待办 / 进行中 / 等用户 / 完成。

## A · 开发（`claude/admiring-clarke-2azzvz`）

| 任务 | 状态 | 备注 |
|---|---|---|
| 第一阶段 Step 0–4b（骨架、数据模型、AI 层、文本和音频流水线） | 完成 | 见分支提交记录 |
| 底稿：判断转写稿/成稿、润色、带版本的底稿、底稿库页面 | 完成 | b445054 |
| 图文成品：小红书图文 / 公众号贴图 3:4 图卡、各平台可粘贴文字 | 完成 | b445054 |
| 公众号「复制富文本」接 B 的渲染器 + 主题选择 | 完成 | 临时实现 `articleToWechatHtml` 已删除；主题选择记在本机浏览器，默认 essay |
| 润色提示词 v2（按用户认可的语气样本） | 完成 | `prompts/polish/v2.md` + `glossary.md`；v1 保留 |
| 国内账号名改「允安」（图卡署名、提示词、播客名） | 完成 | `src/domain/brand.ts`；海外仍是时予清，界面不改 |
| 取消键：上传中可取消，处理中/底稿/发布信息/审核可「取消这条」（删记录和文件）；选视频直接提示 | 完成 | 用户在本机放了视频没法取消后提的 |
| 视频 5a：上传视频 → 画幅 → 识别 → 粗剪三档逐刀 → 预填 | 完成 | 复用音频链路；试听先听声音 |
| 视频 5b：生成粗剪成片、SRT 字幕、烧字幕版（竖屏/视频号）、封面候选帧、各视频平台标题简介；横屏另出长文和播客 | 完成 | `src/server/video.ts`；提示词 `video-copy/v1` |
| 视频 5c：内容库详情页的视频区块（预览、下载、封面叠字、复制文案） | 完成 | 只加了「成片与封面」「各平台文案」两个标签 |
| 视频：用户本机拿真视频试（字幕字体、烧字幕位置、渲染速度） | 等用户 | 需要 ffmpeg；识别仍是假数据，要火山引擎密钥 |
| 视频：节目类自动插 B roll（试验） | 以后 | HANDOFF §3 |
| 设置页：敏感词增删、模板编辑 | 完成 | 「平台与规则」：词库增删、平台现状、默认选平台规则；「模板」：看全部提示词和版本，改完存新版本到 `data/prompts/` |
| 用真模型跑一遍「底稿 → 图文成品」 | 转给 B | A 建议的下一步：用户在本机 `.env` 配 AI_PROVIDER / AI_MODEL / 密钥，拿自己的录音转写稿试润色效果 |
| 火山引擎语音识别真实验证 | 等用户 | 需要火山引擎密钥，开发环境目前连不上该服务 |
| 音频配画面合成视频 | 以后 | 第一阶段之后；开关是 `AUDIO_TO_VIDEO_READY` |

## B · 文字与发布（`ccr-64e9f40c-r2a7v6`）

| 任务 | 状态 | 备注 |
|---|---|---|
| 建共享记忆和任务板 | 完成 | `MEMORY.md`、`TASKS.md` |
| 学习用户的公众号排版模板，整理成规范 | 完成 | 4 篇参考文章 → 4 套主题，`templates/wechat/README.md`；等用户选默认主题 |
| 写排版渲染器：`Article` → 公众号 HTML | 完成 | `src/domain/wechat/`，带测试；skill 在 `.claude/skills/wechat-layout/` |
| 改进润色（用户改派） | 进行中 | polish v6 + deepseek-reasoner；日常样本相似度 0.74（认可版 1.00）。等用户再给认可样本继续调 |
| 接手文字线和发布流程（用户确认，原 C） | 完成 | 范围见 MEMORY.md 分工表 |
| 用 DeepSeek 跑一遍「底稿 → 长文 / 知乎 / 短帖 / 图卡」 | 待办 | 从 A 转来；用 xiuxing、richang 两个样本 |
| 发布流程（第二阶段）：公众号草稿箱接口、YouTube API、国内播客 RSS | 待办 | 公众号接口权限要先请用户截图确认；接口要固定 IP，只能在用户本机跑 |

## 跨会话请求

| 谁提的 | 给谁 | 内容 | 状态 |
|---|---|---|---|
| B | A | `polishText` 的分块从 2500 字改成 800 字左右（`splitForPolish(text, 800)`，或做成环境变量 `POLISH_CHUNK`）。实测 DeepSeek 块小了理得更细，「然后」少一半，见 MEMORY.md 2026-11-27 记录 | 完成：A 已接在 polishText 开头（只影响底稿，原文不变），分块默认 800 字，可用 POLISH_CHUNK_CHARS 调 |
| B | A | 润色前先过一遍 `cleanTranscriptExport`（`src/domain/polish/clean.ts`）：上传的录音转写导出稿带 AI 摘要、免责声明、「说话人1 00:00:01」行，现在会被润色进底稿。建议在 `polishText` 或文本上传入口调用，`removed` 可以显示给用户看 | 完成：A 已接在 polishText 开头（只影响底稿，原文不变），分块默认 800 字，可用 POLISH_CHUNK_CHARS 调 |
| B | A | 润色提示词 `prompts/polish` 参考 `templates/voice/README.md`（用户语气、同音错字表、分段方式），考虑出 v2 | 完成：A 出了 `prompts/polish/v2.md`，同音错字表放在 `prompts/polish/glossary.md` 可直接加行 |
| B | A | 开工前合并 `origin/ccr-64e9f40c-r2a7v6`，拿到 `MEMORY.md` 和 `TASKS.md`；在 `CLAUDE.md` 加一句「开工前先读 MEMORY.md 和 TASKS.md」 | 完成 |
| A | B | 渲染器请导出 `renderWechatHtml(article: Article): string`（或告诉 A 实际的名字），A 会把公众号「复制富文本」按钮接过去；现在的临时实现在 `src/domain/longform.ts` 的 `articleToWechatHtml`，可以参考 | B 已完成：`import { renderWechatHtml } from "@/domain/wechat"`，签名 `renderWechatHtml(article, { theme?, footer? })`。A 接按钮、删临时实现 |
