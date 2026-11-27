import { decidePlatforms, defaultRegions, isOverseasOnlyTopic, scanSensitive, type PlatformDecision, type SensitiveHit } from "@/domain/compliance";
import { availablePlatforms, defaultPlatforms } from "@/domain/defaults";
import { derivativeText, isPerPlatform, JOB_DERIVATIVE, type DerivativeContent } from "@/domain/derivatives";
import { isPlatformKey, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { CONTENT_TYPES, isTopic, REGIONS, type ContentType, type Orient, type Region, type SourceKind, type Topic } from "@/domain/types";
import type { Prisma, PrismaClient, Source } from "@/generated/prisma/client";
import { detectCuts, keepSegments, remapTranscript, totalLength, type Cut } from "@/domain/roughcut";
import { transcriptText, type Transcript } from "@/domain/transcript";
import type { RoughCutLevel } from "@/domain/types";
import type { AiProvider } from "./ai";
import type { Understand } from "./ai/schemas";
import { layoutLongform, polishText, shortPosts, shownotes, spokenArticle, textKind, understand, videoCopy, zhihu } from "./ai/tasks";
import { defaultAsr, type AsrProvider } from "./asr";
import { dataDir } from "./env";
import { extractSpeechAudio, probe, renderAudioCut } from "./media/ffmpeg";
import { generateAudioVideoItems, generateVideoItems } from "./video";
import { adoptOriginal, audioBackground, derivativePath, removeSourceFiles, resolveData, saveOriginal, workPath } from "./storage";

export type SourceStatus = "processing" | "drafting" | "prefilled" | "generating" | "review" | "approved" | "failed";
export type TextMode = "polish" | "layout";

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

/** 粗剪状态：检测出的每一刀、用户恢复了哪几刀、当前渲染好的试听文件 */
export type RoughCutState = {
  level: RoughCutLevel;
  cuts: Cut[];
  restored: string[];
  version: number;
  rendered?: { version: number; path: string; duration: number };
};

export function readRoughCut(s: Source): RoughCutState | null {
  return (s.roughCut as unknown as RoughCutState | null) ?? null;
}
export function readTranscript(s: Source): Transcript | null {
  return (s.transcript as unknown as Transcript | null) ?? null;
}

export const AUDIO_EXTS = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma)$/i;
export const VIDEO_EXTS = /\.(mp4|mov|m4v|mkv|webm|avi)$/i;

export type Deps = { db: PrismaClient; provider?: AiProvider; asr?: AsrProvider; root?: string };

export function sourceService({ db, provider, asr, root = dataDir() }: Deps) {
  const ai = { provider };
  const getAsr = () => asr ?? defaultAsr();

  async function words(): Promise<string[]> {
    return (await db.sensitiveWord.findMany({ select: { word: true } })).map((w) => w.word);
  }

  async function get(id: string) {
    return db.source.findUniqueOrThrow({ where: { id } });
  }

  async function latestManuscript(sourceId: string) {
    return db.manuscript.findFirst({ where: { sourceId }, orderBy: { version: "desc" } });
  }

  /** 拿去预填、生成、合规扫描的文字：文本素材用最新底稿，音频用转录稿 */
  async function publishText(s: Source): Promise<string> {
    if (s.kind === "text") return (await latestManuscript(s.id))?.body ?? s.text ?? "";
    return s.text ?? "";
  }

  async function fail(id: string, e: unknown) {
    const message = e instanceof Error ? e.message : String(e);
    // 用 updateMany：用户中途取消（记录已删）时不再报错
    await db.source.updateMany({ where: { id }, data: { status: "failed", error: message } });
  }

  /**
   * 用户取消一条内容：删掉记录（底稿、成品、发布任务一起删）和它的全部文件。
   * 已批准或已经在发布的内容不能这样删。
   */
  async function remove(id: string) {
    const s = await db.source.findUnique({ where: { id } });
    if (!s) return;
    if (s.status === "approved") throw new Error("已批准的内容不能取消");
    const live = await db.publishJob.count({ where: { sourceId: id, status: { in: ["approved", "queued", "uploading", "awaiting_click", "published"] } } });
    if (live > 0) throw new Error("这条内容已经在发布了，不能取消");
    await db.source.delete({ where: { id } });
    await removeSourceFiles(id, root);
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
      const text = await publishText(s);
      const hits = scanSensitive(text, await words());
      const r = await understand({ kind: s.kind as SourceKind, text }, ai);
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
          stage: null,
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
      const der = ders.find((x) => x.kind === kind && (!isPerPlatform(kind!) || x.platform === d.key));
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
      if (s.kind === "audio") return await generateAudio(id);
      if (s.kind === "video") return await generateVideo(id);
      const d = readDraft(s);
      const input = { text: await publishText(s), title: d.title, topic: d.topic };
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
    const input = { text: await publishText(s), title: d.title, topic: d.topic };
    const old = der.content as unknown as DerivativeContent;
    let content: DerivativeContent;
    let prompt: { name: string; version: number };

    if (old.kind === "video" || old.kind === "subtitle" || old.kind === "cover") {
      throw new Error("成片、字幕、封面不能单独重新生成");
    } else if (old.kind === "video_copy") {
      const rc = readRoughCut(s)!;
      const r = await videoCopy({ transcript: cleanedTranscript(s, rc), title: d.title, topic: d.topic, orient: s.orient as Orient, platforms: [der.platform!] }, ai);
      const c = r.data.platforms[der.platform as keyof typeof r.data.platforms]!;
      content = { kind: "video_copy", title: c.title, desc: c.desc, tags: c.tags };
      prompt = r.prompt;
    } else if ((s.kind === "audio" || s.kind === "video") && old.kind !== "post") {
      ({ content, prompt } = await regenerateAudioItem(s, old));
    } else if (old.kind === "podcast") {
      throw new Error("播客音频不能单独重新生成");
    } else if (old.kind === "longform" || old.kind === "zhihu_article") {
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



  // ───────────────────────── 文本底稿 ─────────────────────────

  async function addManuscript(
    sourceId: string,
    body: string,
    origin: "ai" | "original" | "user",
    extra: { prompt?: { name: string; version: number }; warnings?: string[] } = {},
  ) {
    const last = await latestManuscript(sourceId);
    const m = await db.manuscript.create({
      data: {
        sourceId,
        version: (last?.version ?? 0) + 1,
        body,
        origin,
        templateKey: extra.prompt?.name ?? null,
        templateVersion: extra.prompt?.version ?? null,
        warnings: json(extra.warnings ?? []),
      },
    });
    await db.source.update({ where: { id: sourceId }, data: { hits: json(scanSensitive(body, await words())) } });
    return m;
  }

  /** 按处理方式出一版底稿：润色或原样 */
  async function draftWith(id: string, mode: TextMode) {
    const s = await get(id);
    const original = s.text ?? "";
    await setStage(id, "polish");
    if (mode === "polish") {
      const r = await polishText(original, ai);
      await addManuscript(id, r.text, "ai", { prompt: r.prompt, warnings: r.warnings });
    } else {
      await addManuscript(id, original, "original");
    }
  }

  /** 文本处理：判断是转写稿还是成稿 → 出第一版底稿 → 等你确认 */
  async function processText(id: string) {
    try {
      const s = await get(id);
      await setStage(id, "detect");
      const k = await textKind(s.text ?? "", ai);
      await db.source.update({ where: { id }, data: { textMode: k.data.mode, textModeReason: k.data.reason, textModeEdited: false } });
      await draftWith(id, k.data.mode);
      return await db.source.update({ where: { id }, data: { status: "drafting", stage: null, error: null } });
    } catch (e) {
      await fail(id, e);
      return get(id);
    }
  }

  async function editableDraft(id: string) {
    const s = await get(id);
    if (s.kind !== "text" || s.status !== "drafting") throw new Error("只有待确认的底稿可以修改");
    return s;
  }

  /** 切换处理方式（润色 ↔ 只排版），或在当前方式下重新润色；先标记为处理中，实际处理在后台跑 */
  async function requestRedraft(id: string, mode: TextMode) {
    const s = await editableDraft(id);
    await db.source.update({
      where: { id },
      data: { status: "processing", stage: "polish", textMode: mode, textModeEdited: s.textModeEdited || mode !== s.textMode },
    });
  }
  async function runRedraft(id: string) {
    try {
      const s = await get(id);
      await draftWith(id, (s.textMode as TextMode) ?? "polish");
      return await db.source.update({ where: { id }, data: { status: "drafting", stage: null, error: null } });
    } catch (e) {
      await fail(id, e);
      return get(id);
    }
  }

  /** 保存你手改的底稿（存成新版本） */
  async function saveManuscript(id: string, body: string) {
    await editableDraft(id);
    const text = body.replace(/\r\n?/g, "\n").trim();
    if (!text) throw new Error("底稿不能为空");
    const last = await latestManuscript(id);
    if (last?.body === text) return last;
    return addManuscript(id, text, "user");
  }

  /** 回到某个旧版本（复制成一个新版本，历史不丢） */
  async function restoreManuscript(id: string, version: number) {
    await editableDraft(id);
    const m = await db.manuscript.findUniqueOrThrow({ where: { sourceId_version: { sourceId: id, version } } });
    return addManuscript(id, m.body, "user");
  }

  /** 确认底稿 → 进入预填（标题、主题、平台、合规） */
  async function confirmManuscript(id: string) {
    await editableDraft(id);
    await db.source.update({ where: { id }, data: { status: "processing", stage: "prefill" } });
  }

  // ───────────────────────── 音频 ─────────────────────────

  /** 新建音频/视频素材：探测文件（视频顺便看横竖屏）、把临时文件挪成只读原件。后续处理两者共用 processAudio。 */
  async function createMedia(input: { name: string; tempPath: string }) {
    const info = await probe(input.tempPath);
    if (!info.hasAudio) throw new Error("这个文件里没有声音");
    const video = info.hasVideo;
    const s = await db.source.create({
      data: video
        ? { kind: "video", type: "talk", orient: info.orient ?? "h", originalName: input.name, filePath: "", mimeType: "video", durationSec: info.duration, stage: "extract" }
        : { kind: "audio", type: "audio", orient: "h", originalName: input.name, filePath: "", mimeType: "audio", durationSec: info.duration, stage: "extract" },
    });
    const file = await adoptOriginal(s.id, input.name, input.tempPath, root);
    return db.source.update({ where: { id: s.id }, data: { filePath: file.rel, sizeBytes: file.size } });
  }

  async function setStage(id: string, stage: string | null) {
    await db.source.update({ where: { id }, data: { stage } });
  }

  /** 按当前粗剪状态渲染试听 / 成品音频。只有版本仍是最新时才写回，避免快速连点时旧结果覆盖新结果。 */
  async function renderRoughCut(id: string) {
    const s = await get(id);
    const rc = readRoughCut(s);
    if (!rc || !s.durationSec) return s;
    if (rc.rendered?.version === rc.version) return s;
    const keep = keepSegments(s.durationSec, rc.cuts, rc.restored);
    const rel = derivativePath(id, `podcast-v${rc.version}.mp3`);
    await renderAudioCut(resolveData(s.filePath, root), keep, resolveData(rel, root), { loudnorm: true });
    const latest = await get(id);
    const now = readRoughCut(latest);
    if (!now || now.version !== rc.version) return latest;
    const next: RoughCutState = { ...now, rendered: { version: rc.version, path: rel, duration: totalLength(keep) } };
    return db.source.update({ where: { id }, data: { roughCut: json(next) } });
  }

  /** 音频处理：抽音轨 → 语音识别 → 粗剪 → 渲染试听 → 合规 + 预填。失败时记下原因。 */
  async function processAudio(id: string) {
    try {
      let s = await get(id);
      const original = resolveData(s.filePath, root);
      await setStage(id, "extract");
      const speech = resolveData(workPath(id, "speech.mp3"), root);
      await extractSpeechAudio(original, speech);

      await setStage(id, "asr");
      const t = await getAsr().transcribe(speech, { durationSec: s.durationSec ?? undefined });
      if (!t.words.length) throw new Error("没有识别出说话内容");

      await setStage(id, "cut");
      const level: RoughCutLevel = "standard";
      const rc: RoughCutState = { level, cuts: detectCuts(t, level), restored: [], version: 1 };
      s = await db.source.update({
        where: { id },
        data: { transcript: json(t), text: transcriptText(t), durationSec: t.duration || s.durationSec, roughCut: json(rc), roughCutLevel: level },
      });

      await setStage(id, "render");
      await renderRoughCut(id);

      await setStage(id, "prefill");
      const r = await prefill(id);
      if (r.status === "failed") return r;
      await setStage(id, null);
      return get(id);
    } catch (e) {
      await fail(id, e);
      return get(id);
    }
  }

  async function editableRoughCut(id: string) {
    const s = await get(id);
    if (s.status !== "prefilled") throw new Error("只有还没开始生成的内容可以调整粗剪");
    const rc = readRoughCut(s);
    const t = readTranscript(s);
    if (!rc || !t) throw new Error("这条内容没有粗剪");
    return { s, rc, t };
  }

  /** 换剪的力度：重新检测，之前恢复的刀清空 */
  async function setCutLevel(id: string, level: RoughCutLevel) {
    const { rc, t } = await editableRoughCut(id);
    const next: RoughCutState = { level, cuts: detectCuts(t, level), restored: [], version: rc.version + 1, rendered: rc.rendered };
    return db.source.update({ where: { id }, data: { roughCut: json(next), roughCutLevel: level } });
  }

  /** 单独恢复 / 重新剪掉某一刀 */
  async function toggleCut(id: string, cutId: string) {
    const { rc } = await editableRoughCut(id);
    if (!rc.cuts.some((c) => c.id === cutId)) throw new Error("没有这一刀");
    const restored = rc.restored.includes(cutId) ? rc.restored.filter((x) => x !== cutId) : [...rc.restored, cutId];
    const next: RoughCutState = { ...rc, restored, version: rc.version + 1 };
    return db.source.update({ where: { id }, data: { roughCut: json(next) } });
  }

  function cleanedTranscript(s: Source, rc: RoughCutState): Transcript {
    const t = readTranscript(s)!;
    return remapTranscript(t, keepSegments(s.durationSec ?? t.duration, rc.cuts, rc.restored));
  }

  /** 由剪好的口播派生的文字和播客：节目说明 + 播客音频、长文、知乎。which 控制要哪些。 */
  async function spokenExtras(s: Source, rc: RoughCutState, which: { podcast: boolean; article: boolean }) {
    const d = readDraft(s);
    const cleaned = cleanedTranscript(s, rc);
    const text = transcriptText(cleaned);
    const out: { platform: PlatformKey | null; content: DerivativeContent; filePath?: string; prompt: { name: string; version: number } }[] = [];
    if (which.podcast) {
      const notes = await shownotes({ transcript: cleaned, title: d.title, topic: d.topic }, ai);
      out.push({ platform: null, content: { kind: "podcast", title: d.title, shownotes: notes.data.text, durationSec: rc.rendered!.duration }, filePath: rc.rendered!.path, prompt: notes.prompt });
    }
    if (which.article) {
      const art = await spokenArticle({ text, title: d.title, topic: d.topic }, ai);
      const articleText = art.data.blocks.map((b) => b.text).join("\n\n");
      const zh = await zhihu({ text: articleText, title: art.data.title, topic: d.topic }, ai);
      out.push({ platform: "gzh", content: { kind: "longform", article: art.data }, prompt: art.prompt });
      out.push({ platform: "zhihu", content: { kind: "zhihu_article", question: zh.data.question, article: art.data }, prompt: zh.prompt });
      out.push({ platform: "zhihu", content: { kind: "zhihu_idea", text: zh.data.idea }, prompt: zh.prompt });
    }
    return out;
  }

  /** 清掉旧成品，写入新成品，重算发布任务，进入审核 */
  async function replaceDerivatives(
    id: string,
    items: { platform: PlatformKey | null; content: DerivativeContent; filePath?: string; prompt: { name: string; version: number } | null }[],
  ) {
    const w = await words();
    await db.publishJob.deleteMany({ where: { sourceId: id } });
    await db.derivative.deleteMany({ where: { sourceId: id } });
    for (const it of items) {
      await db.derivative.create({
        data: {
          sourceId: id,
          kind: it.content.kind,
          platform: it.platform,
          content: json(it.content),
          filePath: it.filePath ?? null,
          templateKey: it.prompt?.name ?? null,
          templateVersion: it.prompt?.version ?? null,
          hits: json(scanSensitive(derivativeText(it.content), w)),
        },
      });
    }
    await syncJobs(id);
    return db.source.update({ where: { id }, data: { status: "review", stage: null, error: null } });
  }

  async function generateAudio(id: string) {
    await renderRoughCut(id);
    const s = await get(id);
    const rc = readRoughCut(s);
    if (!rc?.rendered || rc.rendered.version !== rc.version) throw new Error("播客音频还没渲染好");
    const d = readDraft(s);
    // 勾了视频平台：用剪好的声音配照片、声波和字幕出一条横屏视频
    const video = d.platforms.some((k) => PLATFORMS[k].format === "video")
      ? await generateAudioVideoItems({
          sourceId: id,
          audio: rc.rendered.path,
          cleaned: cleanedTranscript(s, rc),
          version: rc.version,
          title: d.title,
          topic: d.topic,
          platforms: d.platforms,
          photo: await audioBackground(root),
          root,
          ai,
          onStage: (stage) => setStage(id, stage),
        })
      : [];
    return replaceDerivatives(id, [...video, ...(await spokenExtras(s, rc, { podcast: true, article: true }))]);
  }

  /** 视频：粗剪成片、字幕、封面、各平台文案；横屏另出长文和播客（按勾选） */
  async function generateVideo(id: string) {
    await renderRoughCut(id);
    const s = await get(id);
    const rc = readRoughCut(s);
    if (!rc?.rendered || rc.rendered.version !== rc.version || !s.durationSec) throw new Error("粗剪还没准备好");
    const d = readDraft(s);
    const orient = s.orient as Orient;
    const items = await generateVideoItems({
      sourceId: id,
      original: resolveData(s.filePath, root),
      segments: keepSegments(s.durationSec, rc.cuts, rc.restored),
      cleaned: cleanedTranscript(s, rc),
      version: rc.version,
      orient,
      title: d.title,
      topic: d.topic,
      platforms: d.platforms,
      root,
      ai,
      onStage: (stage) => setStage(id, stage),
    });
    const extras = await spokenExtras(s, rc, {
      podcast: d.platforms.some((k) => PLATFORMS[k].format === "podcast"),
      article: d.platforms.some((k) => PLATFORMS[k].format === "longform"),
    });
    return replaceDerivatives(id, [...items, ...extras]);
  }

  async function regenerateAudioItem(s: Source, old: DerivativeContent): Promise<{ content: DerivativeContent; prompt: { name: string; version: number } }> {
    const rc = readRoughCut(s)!;
    const d = readDraft(s);
    const cleaned = cleanedTranscript(s, rc);
    if (old.kind === "podcast") {
      const r = await shownotes({ transcript: cleaned, title: d.title, topic: d.topic }, ai);
      return { content: { ...old, shownotes: r.data.text }, prompt: r.prompt };
    }
    if (old.kind === "zhihu_idea") {
      const r = await zhihu({ text: transcriptText(cleaned), title: d.title, topic: d.topic }, ai);
      return { content: { kind: "zhihu_idea", text: r.data.idea }, prompt: r.prompt };
    }
    const r = await spokenArticle({ text: transcriptText(cleaned), title: d.title, topic: d.topic }, ai);
    const content: DerivativeContent = old.kind === "zhihu_article" ? { ...old, article: r.data } : { kind: "longform", article: r.data };
    return { content, prompt: r.prompt };
  }

  return {
    remove, createText, prefill, updateDraft, restorePrefill, startGenerate, generate, regenerate, approve, syncJobs,
    createMedia, processAudio, renderRoughCut, setCutLevel, toggleCut,
    processText, requestRedraft, runRedraft, saveManuscript, restoreManuscript, confirmManuscript, latestManuscript,
  };
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
