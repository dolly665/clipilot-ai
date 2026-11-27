"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/server/app";
import { savePromptVersion } from "@/server/ai/prompts";
import { saveAudioBackground } from "@/server/storage";

export type FormResult = { error?: string; ok?: string };

/** 加敏感词：去掉首尾空格，重复的不再加 */
export async function addWord(_: FormResult, form: FormData): Promise<FormResult> {
  const word = String(form.get("word") ?? "").trim();
  if (!word) return { error: "请输入一个词" };
  if ([...word].length > 20) return { error: "词太长了（最多 20 个字）" };
  const exists = await prisma.sensitiveWord.findUnique({ where: { word } });
  if (exists) return { error: `「${word}」已经在词库里了` };
  await prisma.sensitiveWord.create({ data: { word } });
  revalidatePath("/settings");
  return { ok: `已加入「${word}」` };
}

export async function removeWord(id: string) {
  await prisma.sensitiveWord.deleteMany({ where: { id } });
  revalidatePath("/settings");
}

/** 把模板页里改的提示词存成新版本 */
export async function savePrompt(name: string, _: FormResult, form: FormData): Promise<FormResult> {
  let v: number;
  try {
    v = savePromptVersion(name, String(form.get("body") ?? ""));
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/templates");
  redirect(`/templates?t=${name}&saved=${v}`);
}

/** 换音频配画面用的背景照片 */
export async function uploadAudioBackground(_: FormResult, form: FormData): Promise<FormResult> {
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "请选一张照片" };
  if (file.size > 20 * 1024 * 1024) return { error: "照片超过 20MB" };
  const ext = file.name.split(".").pop() ?? "";
  try {
    await saveAudioBackground(Buffer.from(await file.arrayBuffer()), ext);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/settings");
  return { ok: "已换好，之后生成的音频视频都用这张" };
}

export async function disconnectYoutube() {
  const { youtubeDisconnect } = await import("@/server/publish/youtube");
  await youtubeDisconnect();
  revalidatePath("/settings");
}
