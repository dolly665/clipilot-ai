# Clipilot AI v1

> TikTok Creator Tool — AI-powered content package generation  
> Single HTML file · Zero dependencies · No server · No build step

---

## What It Does

Drop a short video (MP4/MOV, ≤50MB) into the browser. Clipilot AI will:

1. **Extract frames** from the video and optionally transcribe audio
2. **Understand the video** — detects style, mood, subjects, key moments
3. **Generate a content package** in parallel:
   - **3 candidate cover frames** (AI-picked, user selectable)
   - **3–4 title options** (single-select, one recommended)
   - **TikTok-style description** with hook + body + CTA
   - **12–15 hashtags** in 3 tiers (broad / category / niche), multi-select
4. **Live TikTok preview** — simulates how the post looks in the TikTok feed
5. **One-click copy** to clipboard, ready to paste into TikTok

---

## Quick Start

1. Open `index.html` in Chrome or Edge
2. Click ⚙ (top-right) → pick your AI provider → paste your API key → Save
3. Drag a video onto the page
4. Click **Analyze**
5. Select your preferred cover / title / hashtags
6. Click **Copy to Clipboard**

That's it. No install, no server, no build.

---

## Supported AI Providers

| Provider | Key From | Model |
|----------|----------|-------|
| **Anthropic** | [console.anthropic.com](https://console.anthropic.com) | Claude Sonnet 4 / Opus 4 |
| **OpenAI** | [platform.openai.com](https://platform.openai.com) | GPT-4o / GPT-4o Mini |
| **Qwen (通义千问)** | [dashscope.console.aliyun.com](https://dashscope.console.aliyun.com) | Qwen VL Max / VL Plus |

Audio transcription (optional) uses OpenAI Whisper. Any provider can be used for the main analysis.

---

## Architecture

```
index.html (~850 lines)

Phase 1: Video Understanding (1 API call)
  ├── extractFrames()       → 1 frame/sec, dual quality (analysis + HQ cover)
  ├── transcribeAudio()     → browser AudioContext → WAV → Whisper API
  └── AI analysis           → {detected_style, mood, subjects, key_moments}

Phase 2: 4 Skills in Parallel (4 API calls)
  ├── Cover Skill           → 3 best frame indices
  ├── Title Skill           → 3-4 titles, 1 recommended
  ├── Description Skill     → TikTok-style description
  └── Hashtag Skill         → 12-15 tags in 3 tiers, 6-8 recommended

UI
  ├── Cover: 1 large + 3 thumbnail candidates
  ├── TikTok phone preview (live updating)
  ├── Multi-select hashtags
  ├── Single-select titles
  └── Editable description
```

---

## File Structure

```
clipilot-v1/
├── index.html          ← The entire application
├── cover-mockup.html   ← Standalone cover preview samples
├── README.md           ← This file
```

---

## API Cost (per analysis)

| Provider | ~ Cost |
|----------|--------|
| Anthropic Claude Sonnet 4 | $0.03–0.05 |
| OpenAI GPT-4o | $0.02–0.04 |
| Qwen VL Max | ¥0.05–0.15 |

Whisper transcription (optional): ~$0.003 for a 10-second video.

---

## Browser Support

Chrome, Edge, Firefox, Safari (latest versions).

---

## Limits

- Video ≤ 50MB, 3–60 seconds
- No backend — API keys are in browser localStorage
- Demo-grade, not production
