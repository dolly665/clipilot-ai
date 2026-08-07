# Clipilot AI — Skill System Code Reference

> Complete breakdown of the AI prompt architecture and how each "Skill" works.  
> All code lives inside `index.html`, structured as plain JavaScript functions.

---

## Overview: What "Skills" Are

Clipilot doesn't use separate microservices or plugin files. The "skill" is a **prompt architecture pattern** where each content type gets its own AI call with a specialized prompt. This makes each output high-quality and independently regenerable.

The system has two phases:

```
Phase 1: Video Understanding
         ↓ (one API call)
       Analysis Report {style, mood, subjects, key_moments, ...}
         ↓
Phase 2: Four Skills (four parallel API calls)
         All share the analysis report as context
```

---

## Phase 1: Video Understanding Prompt

**File:** `index.html` — function `buildAnalysisPrompt(transcript)`

```javascript
function buildAnalysisPrompt(transcript){
  return `IMPORTANT: Your response must be ONLY valid JSON. 
No markdown, no explanation, no other text.

You analyze TikTok video content.
[ TikTok style guide injected here ]
${transcript ? `AUDIO TRANSCRIPT: "${transcript}"\n` : 'No transcript.\n'}

Return this exact JSON structure (fill in the values):
{
  "detected_style": "one of: Vlog, Food, Dance, Pet, Comedy, Tutorial, Fashion, Travel, Fitness, Lifestyle, General",
  "mood": "2-3 words",
  "subjects": "concise description of what is in the video",
  "key_moments": "2-4 key moments with timestamps in seconds",
  "suggested_covers": [0, 0, 0],
  "transcript_summary": "one sentence summary or None"
}
Your response must start with { and end with }. No other text.`;
}
```

**Input:** Up to 16 video frames (as base64 JPEG images) + optional Whisper transcript text.  
**Output:** Structured JSON describing what the video is about — style category, emotional tone, subjects, key timestamps, and 3 suggested cover frame indices.

---

## Phase 2: Four Independent Skills

Each skill receives the **analysis report** as context (`buildSkillCtx` function) plus TikTok creative guidelines, user style/market/sensitive-word settings.

### Skill 1: Cover Frame Picker

```javascript
const SKILL_PROMPTS = {
  cover: (ctx) => `IMPORTANT: Only return valid JSON, no other text. 
Your response must start with { and end with }.
Pick the 3 best cover frame indices from the video. 
[ TikTok guide ]
${ctx}
Return EXACTLY: {"cover_frames":[idx1,idx2,idx3]}. 
Pick sharp, emotive, scroll-stopping frames.`,
  // ...
};
```

**What it does:** Given 8 frames from the video, selects the 3 most visually striking ones as cover candidates. The three are rendered as a large main preview + thumbnails in the UI.

---

### Skill 2: Title Writer

```javascript
title: (ctx, style, market, sens) => {
  const sl = sens.length ? sens.join(', ') : '(none)';
  return `IMPORTANT: Only return valid JSON, no other text. 
Your response must start with { and end with }.
Write TikTok titles for ${market}. 
[ TikTok guide ]
${ctx}
STYLE:${style} AVOID:${sl}
Generate 3-4 title options (under 40 chars, max 1 emoji). 
Mark exactly 1 as recommended.
Return EXACTLY: {"titles":[{"text":"...","recommended":false},...]}`;
},
```

**What it does:** Generates 3–4 short title options. Respects style, target market, and avoids user-specified sensitive words. Marks one as the recommendation.

---

### Skill 3: Description Writer

```javascript
description: (ctx, style, market, sens) => {
  const sl = sens.length ? sens.join(', ') : '(none)';
  return `IMPORTANT: Only return valid JSON, no other text. 
Your response must start with { and end with }.
Write 1 TikTok description (TEXT ONLY, no hashtags — hashtags are handled separately).
[ TikTok guide ]
${ctx}
STYLE:${style} AVOID:${sl}
Hook first, 2-3 short lines, CTA last. 
Each sentence on own line. Under 400 chars. 
NO hashtags allowed in the description.
Return EXACTLY: {"description":"..."}`;
},
```

**What it does:** Writes a single TikTok-style description with hook → body → CTA structure. Explicitly forbidden from including hashtags (hashtags are generated separately).

---

### Skill 4: Hashtag Strategist

```javascript
hashtags: (ctx, style, market) => `IMPORTANT: Only return valid JSON, no other text.
Your response must start with { and end with }.
Generate TikTok hashtags for ${market}. 
[ TikTok guide ]
${ctx}
12-15 tags in 3 tiers. Mark 6-8 as recommended.
Return EXACTLY: {"hashtags":[{"tag":"#tag","recommended":false},...]}`
```

**What it does:** Generates 12–15 hashtags organized in three tiers:
- 2–3 broad discovery tags (#fyp, #viral)
- 4–5 category tags (#foodtok, #catsoftiktok)
- 4–5 niche/long-tail tags

Marks 6–8 as recommended (a balanced mix from all three tiers).

---

## The TikTok Style Guide

All skills include a shared creative guidance section:

```javascript
const TIKTOK_GUIDE = `
TikTok content strategy notes (use as creative reference, not output format):
- Covers: sharp frames showing peak emotion, clean subject, good contrast. 
  Avoid blur/transitions.
- Titles: short (under 40 chars), patterns like POV, When, The moment, 
  number contrasts. Max 1 emoji.
- Descriptions: hook first, 2-3 short lines, engagement CTA last. 
  ~1 emoji per line.
- Hashtags: 3-tier — 2-3 broad (#fyp), 4-5 category (#foodtok), 
  4-5 niche. 12-15 total.`;
```

---

## How Skills Fit Into the UI

Each skill maps to a UI section:

| Skill | UI Element | User Can |
|-------|-----------|----------|
| Cover | 1 large + 3 thumbnail canvases in `.cover-layout` | Click thumbnails to switch, download selected |
| Title | `.title-options` with radio buttons | Pick one (mutually exclusive), regenerate |
| Description | `.description-box` (contenteditable) | Edit freely, regenerate |
| Hashtags | `.hashtag-grid` with selectable pills | Toggle individual tags, regenerate |

The **TikTok phone preview** (`.phone-frame`) renders the currently selected cover frame + title + description + selected hashtags together, showing exactly how the post will look in the TikTok feed.

---

## How Skills Are Called

All four skills run in parallel via `Promise.all()`:

```javascript
async function runAllSkills(frames, report) {
  const [coverR, titleR, descR, tagR] = await Promise.all([
    runSkill('cover', report, frames),
    runSkill('title', report, []),
    runSkill('description', report, []),
    runSkill('hashtags', report, [])
  ]);
  return {
    cover_frames: coverR.cover_frames || [...],
    titles: titleR.titles || [...],
    description: descR.description || '',
    hashtags: tagR.hashtags || []
  };
}
```

Regeneration of a single skill also uses the same `runSkill()` function:

```javascript
async function regenerateSkill(name) {
  // ...
  const r = await runSkill(name, state.analysisReport, state.frames);
  // Update only the relevant UI section
}
```

---

## Multi-Provider Routing

The `runSkill` function doesn't care which AI provider is used. It builds a unified prompt + image payload, then routes to `apiCall()` which dispatches to the provider-specific handler:

```javascript
async function apiCall(systemPrompt, messages, maxTokens = 1500) {
  const key = (settings.apiKey || '').replace(/[\s ]+/g, '').trim();
  switch (settings.provider) {
    case 'openai':   return openaiCall(systemPrompt, messages, maxTokens, key);
    case 'qwen':     return qwenCall(systemPrompt, messages, maxTokens, key);
    default:         return anthropicCall(systemPrompt, messages, maxTokens, key);
  }
}
```

Each provider handler formats the request differently:
- **Anthropic**: `source: {type: "base64", data: "..."}`, system prompt as top-level field
- **OpenAI/Qwen**: `image_url: {url: "data:image/jpeg;base64,..."}`, system prompt as first message

---

## Frame Quality Strategy

Two extraction passes for different purposes:

```javascript
// Analysis frames: 512px, JPEG 0.6
// → For API calls (low cost, fast transfer)
frames.push({ index, time, dataUrl: canvas.toDataURL('image/jpeg', 0.6) });

// HQ frames: original video resolution, JPEG 0.92
// → For cover rendering (sharp, high quality)
hqFrames.push({ index, time, dataUrl: canvas.toDataURL('image/jpeg', 0.92) });
```

---

## Summary: Skill Architecture

```
User clicks "Analyze"
    │
    ├── extractFrames() → frames[] + hqFrames[]
    ├── transcribeAudio() → transcript (optional)
    │
    ├── Phase 1: runVideoUnderstanding()
    │     → analysisReport {style, mood, subjects, key_moments, ...}
    │
    ├── Phase 2: runAllSkills() — 4 parallel calls
    │     ├── Skill "cover"      → {"cover_frames": [0,4,7]}
    │     ├── Skill "title"      → {"titles": [{"text":"...","recommended":true}, ...]}
    │     ├── Skill "description"→ {"description": "..."}
    │     └── Skill "hashtags"   → {"hashtags": [{"tag":"#fyp","recommended":true}, ...]}
    │
    └── renderResults() → fills all UI sections + phone preview
```

Each skill is a **pure function** of (analysis context, user settings) → structured JSON. They are independent, parallelizable, and individually regenerable. This is the core architecture that makes the "Clipilot AI Skill" system work.
