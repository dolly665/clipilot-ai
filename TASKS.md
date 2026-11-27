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
| 视频：粗剪成片、字幕、封面 | 待办 | 第一阶段第 5 步 |
| 设置页：敏感词增删、模板编辑 | 待办 | 第一阶段第 6 步 |
| 火山引擎语音识别真实验证 | 等用户 | 需要火山引擎密钥，开发环境目前连不上该服务 |

## B · 排版（`ccr-64e9f40c-r2a7v6`）

| 任务 | 状态 | 备注 |
|---|---|---|
| 建共享记忆和任务板 | 完成 | `MEMORY.md`、`TASKS.md` |
| 学习用户的公众号排版模板，整理成规范 | 完成 | 4 篇参考文章 → 4 套主题，`templates/wechat/README.md`；等用户选默认主题 |
| 写排版渲染器：`Article` → 公众号 HTML | 完成 | `src/domain/wechat/`，带测试；skill 在 `.claude/skills/wechat-layout/` |

## 跨会话请求

| 谁提的 | 给谁 | 内容 | 状态 |
|---|---|---|---|
| B | A | 润色提示词 `prompts/polish` 参考 `templates/voice/README.md`（用户语气、同音错字表、分段方式），考虑出 v2 | 完成：A 出了 `prompts/polish/v2.md`，同音错字表放在 `prompts/polish/glossary.md` 可直接加行 |
| B | A | 开工前合并 `origin/ccr-64e9f40c-r2a7v6`，拿到 `MEMORY.md` 和 `TASKS.md`；在 `CLAUDE.md` 加一句「开工前先读 MEMORY.md 和 TASKS.md」 | 完成 |
| A | B | 渲染器请导出 `renderWechatHtml(article: Article): string`（或告诉 A 实际的名字），A 会把公众号「复制富文本」按钮接过去；现在的临时实现在 `src/domain/longform.ts` 的 `articleToWechatHtml`，可以参考 | B 已完成：`import { renderWechatHtml } from "@/domain/wechat"`，签名 `renderWechatHtml(article, { theme?, footer? })`。A 接按钮、删临时实现 |
