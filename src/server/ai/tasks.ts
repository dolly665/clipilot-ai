import { assembleArticle, numberParagraphs, splitParagraphs, type Article } from "@/domain/longform";
import { CONTENT_TYPES, TOPICS, type SourceKind, type Topic } from "@/domain/types";
import { runTask, type AiProvider, type TaskResult } from "./index";
import { LongformPlanSchema, ShortPostsSchema, ShownotesSchema, SpokenArticleSchema, UnderstandSchema, ZhihuSchema } from "./schemas";
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
