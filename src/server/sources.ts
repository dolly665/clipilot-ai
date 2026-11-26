import { decidePlatforms, defaultRegions, isOverseasOnlyTopic, scanSensitive, type PlatformDecision, type SensitiveHit } from "@/domain/compliance";
import { availablePlatforms, defaultPlatforms } from "@/domain/defaults";
import { derivativeText, JOB_DERIVATIVE, type DerivativeContent } from "@/domain/derivatives";
import { isPlatformKey, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { CONTENT_TYPES, isTopic, REGIONS, type ContentType, type Orient, type Region, type SourceKind, type Topic } from "@/domain/types";
import type { Prisma, PrismaClient, Source } from "@/generated/prisma/client";
import type { AiProvider } from "./ai";
import type { Understand } from "./ai/schemas";
import { layoutLongform, shortPosts, understand, zhihu } from "./ai/tasks";
import { dataDir } from "./env";
import { saveOriginal } from "./storage";

export type SourceStatus = "processing" | "prefilled" | "generating" | "review" | "approved" | "failed";

/** 发布信息里用户可以改的字段 */
export type DraftFields = {
  title: string;
  type: ContentType;
  topic: Topic;
  regions: Region[];
  platforms: PlatformKey[];
};
export type DraftField = keyof DraftFields;

export type Prefill = {
  understand: Understand;
  prompt: { name: string; version: number };
  regions: Region[];
  platforms: PlatformKey[];
};

const json = (v: unknown) => v as Prisma.InputJsonValue;

export function readHits(v: Prisma.JsonValue): SensitiveHit[] {
  return Array.isArray(v) ? (v as unknown as SensitiveHit[]) : [];
}
export function readStrings(v: Prisma.JsonValue): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}
export function readDraft(s: Source): DraftFields {
  return {
    title: s.title,
    type: (s.type in CONTENT_TYPES ? s.type : "text") as ContentType,
    topic: isTopic(s.topic) ? s.topic : "生活",
    regions: readStrings(s.regions).filter((r): r is Region => (REGIONS as readonly string[]).includes(r)),
    platforms: readStrings(s.platforms).filter(isPlatformKey),
  };
}
export function readPrefill(s: Source): Prefill | null {
  return (s.prefill as unknown as Prefill | null) ?? null;
}

/** 这条内容最终每个平台的去向（发布信息页与生成时共用） */
export function sourceDecisions(s: Source, extraHits: SensitiveHit[] = []): PlatformDecision[] {
  const d = readDraft(s);
  return decidePlatforms({
    topic: d.topic,
    regions: d.regions,
    selected: d.platforms,
    available: availablePlatforms(s.kind as SourceKind, s.orient as Orient),
    hits: [...readHits(s.hits), ...extraHits],
  });
}

export type Deps = { db: PrismaClient; provider?: AiProvider; root?: string };

export function sourceService({ db, provider, root = dataDir() }: Deps) {
  const ai = { provider };

  async function words(): Promise<string[]> {
    return (await db.sensitiveWord.findMany({ select: { word: true } })).map((w) => w.word);
  }

  async function get(id: string) {
    return db.source.findUniqueOrThrow({ where: { id } });
  }

  async function fail(id: string, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    await db.source.update({ where: { id }, data: { status: "failed", error: message } });
  }

  /** 新建文本素材：原文存成只读文件，状态为「处理中」 */
  async function createText(input: { name: string; text: string }) {
    const text = input.text.replace(/\r\n?/g, "\n").trim();
    if (!text) throw new Error("文本是空的");
    const s = await db.source.create({
      data: { kind: "text", type: "text", originalName: input.name || "粘贴的文本.md", filePath: "", mimeType: "text/markdown", text },
    });
    const file = await saveOriginal(s.id, input.name || "pasted.md", text, root);
    return db.source.update({ where: { id: s.id }, data: { filePath: file.rel, sizeBytes: file.size } });
  }

  /** 合规扫描 + AI 预填；失败时记录原因，不抛出（在后台跑） */
  async function prefill(id: string) {
    try {
      const s = await get(id);
      const hits = scanSensitive(s.text ?? "", await words());
      const r = await understand({ kind: s.kind as SourceKind, text: s.text ?? "" }, ai);
      const kind = s.kind as SourceKind;
      const type: ContentType = kind === "text" ? "text" : kind === "audio" ? "audio" : r.data.type;
      const p: Prefill = {
        understand: { ...r.data, type },
        prompt: r.prompt,
        regions: defaultRegions(r.data.topic, hits),
        platforms: defaultPlatforms(kind, s.orient as Orient, type),
      };
      return await db.source.update({
        where: { id },
        data: {
          hits: json(hits),
          prefill: json(p),
          title: p.understand.title,
          titleAlts: json(p.understand.titleAlts),
          type,
          topic: p.understand.topic,
          regions: json(p.regions),
          platforms: json(p.platforms),
          edited: json([]),
          status: "prefilled",
          error: null,
        },
      });
    } catch (e) {
      await fail(id, e);
      return get(id);
    }
  }

  /** 用户改发布信息；记下改过哪些字段。只发海外的主题会强制只勾海外。 */
  async function updateDraft(id: string, patch: Partial<DraftFields>) {
    const s = await get(id);
    if (s.status !== "prefilled") throw new Error("只有预填好、还没开始生成的内容可以改发布信息");
    const cur = readDraft(s);
    const next: DraftFields = { ...cur, ...patch };
    if (isOverseasOnlyTopic(next.topic)) next.regions = ["os"];
    const changed = (Object.keys(patch) as DraftField[]).filter((k) => JSON.stringify(patch[k]) !== JSON.stringify(cur[k]));
    const edited = [...new Set([...readStrings(s.edited), ...changed])];
    return db.source.update({
      where: { id },
      data: {
        title: next.title.trim() || cur.title,
        type: next.type,
        topic: next.topic,
        regions: json(next.regions),
        platforms: json(next.platforms),
        edited: json(edited),
      },
    });
  }

  async function restorePrefill(id: string) {
    const s = await get(id);
    const p = readPrefill(s);
    if (!p || s.status !== "prefilled") throw new Error("没有可恢复的 AI 预填");
    return db.source.update({
      where: { id },
      data: {
        title: p.understand.title,
        type: p.understand.type,
        topic: p.understand.topic,
        regions: json(p.regions),
        platforms: json(p.platforms),
        edited: json([]),
      },
    });
  }

  async function startGenerate(id: string) {
    const s = await get(id);
    if (s.status !== "prefilled" && s.status !== "failed") throw new Error(`当前状态（${s.status}）不能开始生成`);
    if (!readPrefill(s)) throw new Error("还没有预填，不能生成");
    return db.source.update({ where: { id }, data: { status: "generating", error: null } });
  }

  async function saveDerivative(
    sourceId: string,
    platform: PlatformKey | null,
    content: DerivativeContent,
    prompt: { name: string; version: number },
    w: string[],
  ) {
    return db.derivative.create({
      data: {
        sourceId,
        kind: content.kind,
        platform,
        content: json(content),
        templateKey: prompt.name,
        templateVersion: prompt.version,
        hits: json(scanSensitive(derivativeText(content), w)),
      },
    });
  }

  /**
   * 按当前成品重新计算每个平台的发布任务。
   * 生成后的文字只要有一处敏感词，国内平台全部拦截。
   */
  async function syncJobs(sourceId: string) {
    const s = await get(sourceId);
    const ders = await db.derivative.findMany({ where: { sourceId } });
    const derHits = ders.flatMap((d) => readHits(d.hits));
    const decisions = sourceDecisions(s, derHits);
    await db.publishJob.deleteMany({ where: { sourceId } });
    for (const d of decisions) {
      if (d.state === "off") continue;
      const kind = JOB_DERIVATIVE[d.key];
      const der = ders.find((x) => x.kind === kind && (kind !== "post" || x.platform === d.key));
      await db.publishJob.create({
        data: {
          sourceId,
          platform: d.key,
          derivativeId: der?.id ?? null,
          status: d.state === "blocked" ? "compliance_blocked" : "pending_review",
          blockReason: d.state === "blocked" ? d.why : null,
        },
      });
    }
  }

  /** 生成文本素材的全部成品（重复执行会先清掉旧成品） */
  async function generate(id: string) {
    try {
      const s = await get(id);
      if (s.kind !== "text") throw new Error("音频、视频的生成在后续步骤接入");
      const d = readDraft(s);
      const input = { text: s.text ?? "", title: d.title, topic: d.topic };
      const [lf, zh, sp] = await Promise.all([layoutLongform(input, ai), zhihu(input, ai), shortPosts(input, ai)]);
      const w = await words();

      await db.publishJob.deleteMany({ where: { sourceId: id } });
      await db.derivative.deleteMany({ where: { sourceId: id } });
      await saveDerivative(id, "gzh", { kind: "longform", article: lf.data }, lf.prompt, w);
      await saveDerivative(id, "zhihu", { kind: "zhihu_article", question: zh.data.question, article: lf.data }, zh.prompt, w);
      await saveDerivative(id, "zhihu", { kind: "zhihu_idea", text: zh.data.idea }, zh.prompt, w);
      await saveDerivative(id, "gzhp", { kind: "post", ...sp.data.gzhp }, sp.prompt, w);
      await saveDerivative(id, "xhsn", { kind: "post", ...sp.data.xhsn }, sp.prompt, w);
      await saveDerivative(id, "wb", { kind: "post", ...sp.data.wb }, sp.prompt, w);
      await saveDerivative(id, "ytc", { kind: "post", ...sp.data.ytc }, sp.prompt, w);
      await syncJobs(id);
      return await db.source.update({ where: { id }, data: { status: "review", error: null } });
    } catch (e) {
      await fail(id, e);
      return get(id);
    }
  }

  /** 单项重新生成（只在审核阶段） */
  async function regenerate(derivativeId: string) {
    const der = await db.derivative.findUniqueOrThrow({ where: { id: derivativeId } });
    const s = await get(der.sourceId);
    if (s.status !== "review") throw new Error("只有待审核的内容可以重新生成");
    const d = readDraft(s);
    const input = { text: s.text ?? "", title: d.title, topic: d.topic };
    const old = der.content as unknown as DerivativeContent;
    let content: DerivativeContent;
    let prompt: { name: string; version: number };

    if (old.kind === "longform" || old.kind === "zhihu_article") {
      const r = await layoutLongform(input, ai);
      prompt = r.prompt;
      content = old.kind === "longform" ? { kind: "longform", article: r.data } : { ...old, article: r.data };
    } else if (old.kind === "zhihu_idea") {
      const r = await zhihu(input, ai);
      prompt = r.prompt;
      content = { kind: "zhihu_idea", text: r.data.idea };
    } else {
      const r = await shortPosts(input, ai);
      prompt = r.prompt;
      const key = der.platform as "gzhp" | "xhsn" | "wb" | "ytc";
      content = { kind: "post", ...r.data[key] };
    }

    const updated = await db.derivative.update({
      where: { id: derivativeId },
      data: {
        content: json(content),
        templateKey: prompt.name,
        templateVersion: prompt.version,
        hits: json(scanSensitive(derivativeText(content), await words())),
      },
    });
    await syncJobs(s.id);
    return updated;
  }

  /** 一键批准：所有待审任务 → 已批准，并记下排期时间。被合规拦截的不动。 */
  async function approve(id: string, scheduledAt: Date) {
    const s = await get(id);
    if (s.status !== "review") throw new Error("只有待审核的内容可以批准");
    const now = new Date();
    const r = await db.publishJob.updateMany({
      where: { sourceId: id, status: "pending_review" },
      data: { status: "approved", approvedAt: now, scheduledAt },
    });
    await db.source.update({ where: { id }, data: { status: "approved" } });
    return r.count;
  }

  return { createText, prefill, updateDraft, restorePrefill, startGenerate, generate, regenerate, approve, syncJobs };
}

/** 默认排期：今晚 20:00；已经过了就是明晚 20:00 */
export function defaultScheduleTime(now = new Date()): Date {
  const t = new Date(now);
  t.setHours(20, 0, 0, 0);
  if (t <= now) t.setDate(t.getDate() + 1);
  return t;
}

export function platformName(key: string): string {
  return isPlatformKey(key) ? PLATFORMS[key].name : key;
}
