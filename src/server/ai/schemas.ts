import { z } from "zod";
import { CONTENT_TYPES, TOPICS } from "@/domain/types";

const contentTypeKeys = Object.keys(CONTENT_TYPES) as [keyof typeof CONTENT_TYPES, ...(keyof typeof CONTENT_TYPES)[]];
const topicNames = TOPICS.map((t) => t.name) as [(typeof TOPICS)[number]["name"], ...(typeof TOPICS)[number]["name"][]];

export const UnderstandSchema = z.object({
  title: z.string().min(1),
  titleAlts: z.array(z.string().min(1)).min(1).max(3),
  type: z.enum(contentTypeKeys),
  topic: z.enum(topicNames),
  reasons: z.object({ title: z.string(), type: z.string(), topic: z.string() }),
});
export type Understand = z.infer<typeof UnderstandSchema>;

export const LongformPlanSchema = z.object({
  title: z.string().min(1),
  lead: z.string().default(""),
  headings: z.array(z.object({ before: z.number().int().min(0), text: z.string().min(1) })),
  quotes: z.array(z.string()).default([]),
});
export type LongformPlan = z.infer<typeof LongformPlanSchema>;

export const ZhihuSchema = z.object({ question: z.string().min(1), idea: z.string().min(1) });
export type Zhihu = z.infer<typeof ZhihuSchema>;

export const ShortPostsSchema = z.object({
  gzhp: z.object({ title: z.string(), text: z.string().min(1) }),
  xhsn: z.object({ title: z.string(), text: z.string().min(1), tags: z.array(z.string()).default([]) }),
  wb: z.object({ text: z.string().min(1) }),
  ytc: z.object({ text: z.string().min(1) }),
});
export type ShortPosts = z.infer<typeof ShortPostsSchema>;

export const SpokenArticleSchema = z.object({
  title: z.string().min(1),
  lead: z.string().default(""),
  blocks: z
    .array(z.object({ type: z.enum(["heading", "paragraph", "quote"]), text: z.string().min(1) }))
    .min(1)
    .refine((b) => b.some((x) => x.type === "paragraph"), "至少要有一段正文"),
});
export type SpokenArticle = z.infer<typeof SpokenArticleSchema>;

export const ShownotesSchema = z.object({
  summary: z.string().min(1),
  chapters: z.array(z.object({ at: z.string(), title: z.string().min(1) })).default([]),
});
export type Shownotes = z.infer<typeof ShownotesSchema>;
