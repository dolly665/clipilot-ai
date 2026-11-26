import { assembleArticle, numberParagraphs, splitParagraphs, type Article } from "@/domain/longform";
import { CONTENT_TYPES, TOPICS, type SourceKind, type Topic } from "@/domain/types";
import { runTask, type AiProvider, type TaskResult } from "./index";
import { LongformPlanSchema, ShortPostsSchema, UnderstandSchema, ZhihuSchema } from "./schemas";

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
