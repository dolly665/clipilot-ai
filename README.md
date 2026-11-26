# 清清 · 时予清自媒体工作台

把一条录好的视频、音频或长文本拖进来，清清负责转录、粗剪、预填、合规检查，并生成各平台的成品。你只做三步：**录制、拖进来、审核**。没有你的批准，任何内容都不会发布。

- 需求、规则、平台、分阶段：见 [`HANDOFF.md`](HANDOFF.md)
- UI 以可点击原型 [`design/qingqing-mockup.html`](design/qingqing-mockup.html) 为准
- 旧版 Clipilot（TikTok 文案工具）在 [`legacy/`](legacy/)，只作参考

## 本机运行

需要 Node 22+ 和 ffmpeg。

```bash
npm install
cp .env.example .env   # 按需填写 AI / 语音识别的提供方和密钥；默认 fake，不联网
npm run db:push        # 在 data/ 下建 SQLite 库
npm run db:seed        # 写入默认敏感词库
npm run dev            # http://localhost:3000
```

## 检查

```bash
npm run typecheck && npm run lint && npm test
```

技术栈：Next.js（App Router）+ TypeScript + Tailwind + Prisma（SQLite）+ Vitest。
