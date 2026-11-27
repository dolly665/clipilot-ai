"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { RoughCutLevel } from "@/domain/types";
import type { DraftFields, TextMode } from "@/server/sources";
import { prisma, runInBackground, sources } from "@/server/app";

const MAX_TEXT_BYTES = 2 * 1024 * 1024;

export type ActionResult = { error?: string };

function message(e: unknown) {
  return e instanceof Error ? e.message : String(e);
}

/** 上传长文本（粘贴或 .txt / .md 文件） */
export async function uploadText(_: ActionResult, form: FormData): Promise<ActionResult> {
  const file = form.get("file");
  let text = String(form.get("text") ?? "");
  let name = "粘贴的文本.md";
  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_TEXT_BYTES) return { error: "文本文件超过 2MB" };
    if (!/\.(txt|md|markdown)$/i.test(file.name)) {
      return { error: "目前只接受长文本（.txt / .md）。音频、视频会在后续步骤接入。" };
    }
    text = await file.text();
    name = file.name;
  }
  if (!text.trim()) return { error: "请粘贴文字或选择一个文本文件" };

  let id: string;
  try {
    const s = await sources.createText({ name, text });
    id = s.id;
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`整理底稿 ${id}`, () => sources.processText(id));
  redirect(`/new/${id}`);
}

export async function retryPrefill(id: string) {
  const s = await prisma.source.findUniqueOrThrow({ where: { id } });
  // 音频如果连识别都没完成，从头处理；否则只重跑预填
  if (s.kind === "audio" && !s.transcript) runInBackground(`处理音频 ${id}`, () => sources.processAudio(id));
  else if (s.kind === "text" && !(await sources.latestManuscript(id))) runInBackground(`整理底稿 ${id}`, () => sources.processText(id));
  else runInBackground(`预填 ${id}`, () => sources.prefill(id));
  revalidatePath(`/new/${id}`);
}

export async function updateDraft(id: string, patch: Partial<DraftFields>): Promise<ActionResult> {
  try {
    await sources.updateDraft(id, patch);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/new/${id}`);
  return {};
}

export async function restorePrefill(id: string): Promise<ActionResult> {
  try {
    await sources.restorePrefill(id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/new/${id}`);
  return {};
}

export async function startGenerate(id: string): Promise<ActionResult> {
  try {
    await sources.startGenerate(id);
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`生成 ${id}`, () => sources.generate(id));
  redirect(`/library/${id}`);
}

export async function regenerate(derivativeId: string, sourceId: string): Promise<ActionResult> {
  try {
    await sources.regenerate(derivativeId);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/library/${sourceId}`);
  return {};
}

export async function approve(id: string, scheduledAtIso: string): Promise<ActionResult> {
  const when = new Date(scheduledAtIso);
  if (Number.isNaN(when.getTime())) return { error: "发布时间无效" };
  try {
    await sources.approve(id, when);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/", "layout");
  return {};
}

export async function setCutLevel(id: string, level: RoughCutLevel): Promise<ActionResult> {
  try {
    await sources.setCutLevel(id, level);
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`渲染粗剪 ${id}`, () => sources.renderRoughCut(id));
  revalidatePath(`/new/${id}`);
  return {};
}

export async function toggleCut(id: string, cutId: string): Promise<ActionResult> {
  try {
    await sources.toggleCut(id, cutId);
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`渲染粗剪 ${id}`, () => sources.renderRoughCut(id));
  revalidatePath(`/new/${id}`);
  return {};
}

/** 切换处理方式（润色 / 只排版），或重新润色 */
export async function redraft(id: string, mode: TextMode): Promise<ActionResult> {
  try {
    await sources.requestRedraft(id, mode);
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`重新整理底稿 ${id}`, () => sources.runRedraft(id));
  revalidatePath(`/new/${id}`);
  return {};
}

export async function saveManuscript(id: string, body: string): Promise<ActionResult> {
  try {
    await sources.saveManuscript(id, body);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/new/${id}`);
  return {};
}

export async function restoreManuscript(id: string, version: number): Promise<ActionResult> {
  try {
    await sources.restoreManuscript(id, version);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath(`/new/${id}`);
  return {};
}

/** 确认底稿（先保存未保存的修改），进入预填 */
export async function confirmManuscript(id: string, body: string): Promise<ActionResult> {
  try {
    await sources.saveManuscript(id, body);
    await sources.confirmManuscript(id);
  } catch (e) {
    return { error: message(e) };
  }
  runInBackground(`预填 ${id}`, () => sources.prefill(id));
  revalidatePath(`/new/${id}`);
  return {};
}

/** 取消一条内容：删掉记录和它的全部文件，回到上传页 */
export async function cancelSource(id: string): Promise<ActionResult> {
  try {
    await sources.remove(id);
  } catch (e) {
    return { error: message(e) };
  }
  revalidatePath("/", "layout");
  redirect("/new");
}
