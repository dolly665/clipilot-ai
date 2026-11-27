import { assembleArticle, numberParagraphs, splitParagraphs, type Article } from "@/domain/longform";
import { CONTENT_TYPES, TOPICS, type SourceKind, type Topic } from "@/domain/types";
import fs from "node:fs";
import path from "node:path";
import { charCount, splitForPolish } from "@/domain/chunk";
import { cleanTranscriptExport } from "@/domain/polish/clean";
import { runTask, runTextTask, type AiProvider, type TaskResult } from "./index";
import { LongformPlanSchema, ShortPostsSchema, VideoCopySchema, ShownotesSchema, SpokenArticleSchema, TextKindSchema, UnderstandSchema, ZhihuSchema } from "./schemas";
import { formatTime, type Transcript } from "@/domain/transcript";

type Opts = { provider?: AiProvider };

/** 第一步：理解素材，预填标题、类型、主题（各带理由） */
export function understand(input: { kind: SourceKind; text: string }, opts: Opts = {}) {
  return runTask(
    "understand",
    {
      kind: input.kind,
      text: input.text,
      types: Object.entries(CONTENT_TYPES).map(([k, v]) => `- ${k}：${v}`).join("\n"),
      topics: TOPICS.map((t) => `- ${t.name}${t.region === "os" ? "（只发海外）" : ""}`).join("\n"),
    },
    UnderstandSchema,
    { ...opts, maxTokens: 2000 },
  );
}

/** 长文排版：模型只给方案，文章由代码按原文组装，保证原文不被改动 */
export async function layoutLongform(
  input: { text: string; title: string; topic: Topic },
  opts: Opts = {},
): Promise<Omit<TaskResult<unknown>, "data"> & { data: Article }> {
  const paragraphs = splitParagraphs(input.text);
  const r = await runTask(
    "longform",
    { paragraphs: numberParagraphs(paragraphs), title: input.title, topic: input.topic },
    LongformPlanSchema,
    { ...opts, maxTokens: 4000 },
  );
  return { ...r, data: assembleArticle(paragraphs, r.data) };
}

export function zhihu(input: { text: string; title: string; topic: Topic }, opts: Opts = {}) {
  return runTask("zhihu", input, ZhihuSchema, { ...opts, maxTokens: 2000 });
}

export function shortPosts(input: { text: string; title: string; topic: Topic }, opts: Opts = {}) {
  return runTask("short-posts", input, ShortPostsSchema, { ...opts, maxTokens: 6000 });
}

/** 口播稿整理成文章（音频、视频用；可以改写口语，但不加原稿没有的内容） */
export async function spokenArticle(input: { text: string; title: string; topic: Topic }, opts: Opts = {}) {
  const r = await runTask("spoken-article", input, SpokenArticleSchema, { ...opts, maxTokens: 8000 });
  const article: Article = { title: r.data.title, lead: r.data.lead, blocks: r.data.blocks };
  return { ...r, data: article };
}

/** 节目说明：简介 + 章节时间轴。章节时间只接受稿子里真实存在的时间点。 */
export async function shownotes(input: { transcript: Transcript; title: string; topic: Topic }, opts: Opts = {}) {
  const lines = input.transcript.sentences.map((s) => `[${formatTime(s.start)}] ${s.text}`);
  const valid = new Set(input.transcript.sentences.map((s) => formatTime(s.start)));
  valid.add("00:00");
  const r = await runTask(
    "shownotes",
    { title: input.title, topic: input.topic, duration: formatTime(input.transcript.duration), sentences: lines.join("\n") },
    ShownotesSchema,
    { ...opts, maxTokens: 3000 },
  );
  const chapters = r.data.chapters.filter((c) => valid.has(c.at.trim()));
  const text = [r.data.summary.trim(), chapters.length ? "时间轴\n" + chapters.map((c) => `${c.at.trim()} ${c.title.trim()}`).join("\n") : ""]
    .filter(Boolean)
    .join("\n\n");
  return { ...r, data: { text, chapters } };
}

/** 判断文本是录音转写（要润色）还是成稿（只排版）。只看开头 3000 字。 */
export function textKind(text: string, opts: Opts = {}) {
  return runTask("text-kind", { text: [...text].slice(0, 3000).join("") }, TextKindSchema, { ...opts, maxTokens: 500 });
}

export type PolishResult = { text: string; warnings: string[]; prompt: { name: string; version: number } };

/**
 * 理顺润色：长文分块依次处理，每块带上前一块的结尾保持衔接。
 * 每块对比字数：删得太多或加得太多都记一条提醒，让你对照原文检查。
 */
export async function polishText(text: string, opts: Opts = {}): Promise<PolishResult> {
  // 去掉转写工具导出时加的 AI 摘要、说话人和时间行（原文本身不改，只影响底稿）
  const cleaned = cleanTranscriptExport(text);
  const chunks = splitForPolish(cleaned.text, polishChunkChars());
  const out: string[] = [];
  const warnings: string[] = [];
  if (cleaned.removed.length) warnings.push(`去掉了转写工具加的 ${cleaned.removed.length} 行（AI 摘要、说话人、时间），不是你说的话`);
  let prompt = { name: "polish", version: 0 };
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const prev = out.at(-1);
    const context = prev ? `上一部分（已理顺）结尾是：「${[...prev].slice(-120).join("")}」，接着往下理，不要重复它。` : "这是全文的开头。";
    const r = await runTextTask("polish", { text: chunk, context, glossary: loadGlossary() }, { ...opts, maxTokens: 16000 });
    prompt = r.prompt;
    out.push(r.data);
    const before = charCount(chunk);
    const after = charCount(r.data);
    const where = chunks.length > 1 ? `第 ${i + 1} 部分` : "全文";
    if (before > 80 && after < before * 0.5) warnings.push(`${where}删减较多（${before} 字 → ${after} 字），请对照原文检查有没有漏掉内容`);
    if (before > 80 && after > before * 1.3) warnings.push(`${where}比原文长不少（${before} 字 → ${after} 字），请检查有没有加进原文没有的内容`);
  }
  return { text: out.join("\n\n"), warnings, prompt };
}

/** 润色分块大小（字）：块小理得更细，默认 800，可用 POLISH_CHUNK_CHARS 调 */
export function polishChunkChars(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.POLISH_CHUNK_CHARS);
  return Number.isFinite(n) && n >= 200 ? Math.floor(n) : 800;
}

/** 同音错字表：prompts/polish/glossary.md 里「听错 → 应为」的行 */
export function loadGlossary(file = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "prompts/polish/glossary.md")): string {
  try {
    return fs
      .readFileSync(/*turbopackIgnore: true*/ file, "utf8")
      .split("\n")
      .filter((l) => l.includes("→") && !l.startsWith("#") && !l.includes("听错 → 应为"))
      .join("\n");
  } catch {
    return "（无）";
  }
}

/** 视频平台的标题、简介、标签。只要求写本次勾选的平台。 */
export async function videoCopy(
  input: { transcript: Transcript; title: string; topic: Topic; orient: "h" | "v"; platforms: string[] },
  opts: Opts = {},
) {
  const NAMES: Record<string, string> = { bili: "B站", sph: "视频号", dy: "抖音", xhs: "小红书", yt: "YouTube", yts: "YouTube Shorts" };
  const r = await runTask(
    "video-copy",
    {
      title: input.title,
      topic: input.topic,
      orient: input.orient === "v" ? "竖屏" : "横屏",
      duration: formatTime(input.transcript.duration),
      platforms: input.platforms.map((k) => `- ${k}：${NAMES[k] ?? k}`).join("\n"),
      text: input.transcript.sentences.map((s) => s.text).join("\n"),
    },
    VideoCopySchema,
    { ...opts, maxTokens: 4000 },
  );
  const missing = input.platforms.filter((k) => !(k in r.data.platforms));
  if (missing.length) throw new Error(`视频文案缺少平台：${missing.join("、")}`);
  return r;
}
