"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/server/app";
import { publishRunner } from "@/server/publish/runner";

export type PublishActionResult = { error?: string; ok?: string };

const runner = () => publishRunner(prisma);
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** 立即发布一条已批准的任务（不等排期时间） */
export async function publishNow(jobId: string): Promise<PublishActionResult> {
  try {
    const r = await runner().runJob(jobId, { force: true });
    revalidatePath("/publish");
    if (r.status === "published") return { ok: "已发布" };
    return { error: r.error ?? "没有发出去" };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function retryJob(jobId: string): Promise<PublishActionResult> {
  try {
    await runner().retry(jobId);
    revalidatePath("/publish");
    return { ok: "已放回队列" };
  } catch (e) {
    return { error: msg(e) };
  }
}

export async function markPublished(_: PublishActionResult, form: FormData): Promise<PublishActionResult> {
  try {
    await runner().markManual(String(form.get("jobId")), String(form.get("url") ?? ""));
    revalidatePath("/publish");
    return { ok: "已记为发布" };
  } catch (e) {
    return { error: msg(e) };
  }
}
