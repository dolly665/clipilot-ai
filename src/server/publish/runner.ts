import type { PlatformKey } from "@/domain/platforms";
import type { PrismaClient } from "@/generated/prisma/client";
import { CONNECTORS } from "./registry";
import type { PublishConnector } from "./types";

/**
 * 发布执行器：把「已批准」的任务交给对应平台的连接器去发。
 *
 * 状态：approved → queued → uploading → published / failed
 * - 只碰 approved 的任务：没有用户批准的，永远不会被发出去；合规拦截的也不会。
 * - 先用条件更新把 approved 抢成 queued，同一个任务不会被两个进程同时发。
 * - 没有连接器的平台不动，留给用户手动发。
 * - 失败时写清原因，文案和文件都还在，用户可以手动发或者点重试。
 */

export const MANUAL_FALLBACK = "文案和文件都已备好，可以在审核页复制、下载后手动发布。";

export type RunResult = { jobId: string; platform: string; status: "published" | "failed" | "skipped"; url?: string | null; error?: string; warnings?: string[] };

export function publishRunner(db: PrismaClient, connectors: PublishConnector[] = CONNECTORS) {
  const byPlatform = new Map(connectors.map((c) => [c.platform as string, c]));

  /** 现在该发的任务：已批准、有连接器，并且到了排期时间（或者连接器允许提前上传） */
  async function dueJobs(now: Date) {
    if (byPlatform.size === 0) return [];
    const jobs = await db.publishJob.findMany({
      where: { status: "approved", platform: { in: [...byPlatform.keys()] } },
      orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
    });
    const ready = await readyPlatforms();
    return jobs.filter((j) => ready.has(j.platform) && (byPlatform.get(j.platform)!.uploadEarly || !j.scheduledAt || j.scheduledAt <= now));
  }

  /** 现在能自动发的平台（有连接器，并且 ready() 不是 false） */
  async function readyPlatforms(): Promise<Set<string>> {
    const out = new Set<string>();
    for (const [k, c] of byPlatform) {
      const ok = c.ready ? await c.ready().catch(() => false) : true;
      if (ok) out.add(k);
    }
    return out;
  }

  /** 发一个任务。force：不管排期时间，立刻发（发布中心的「立即发布」） */
  async function runJob(jobId: string, opts: { now?: Date; force?: boolean } = {}): Promise<RunResult> {
    const now = opts.now ?? new Date();
    const job = await db.publishJob.findUnique({ where: { id: jobId } });
    if (!job) throw new Error("找不到这条发布任务");
    const connector = byPlatform.get(job.platform);
    const skip = (error: string): RunResult => ({ jobId, platform: job.platform, status: "skipped", error });
    if (job.status !== "approved") return skip(`这条任务现在是「${job.status}」，只有已批准的任务才会发布`);
    if (!connector) return skip(`这个平台还没接自动发布。${MANUAL_FALLBACK}`);
    if (connector.ready && !(await connector.ready().catch(() => false))) return skip(`还没连接这个平台的账号，请到「平台与规则」连接。${MANUAL_FALLBACK}`);
    if (!opts.force && !connector.uploadEarly && job.scheduledAt && job.scheduledAt > now) return skip("还没到排期时间");

    const claimed = await db.publishJob.updateMany({ where: { id: jobId, status: "approved" }, data: { status: "queued", error: null } });
    if (claimed.count === 0) return skip("这条任务已经在发了");
    await db.publishJob.update({ where: { id: jobId }, data: { status: "uploading" } });
    try {
      const r = await connector.publish(db, jobId, { now });
      await db.publishJob.update({ where: { id: jobId }, data: { status: "published", url: r.url, error: r.warnings.length ? r.warnings.join("；") : null } });
      return { jobId, platform: job.platform, status: "published", url: r.url, warnings: r.warnings };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const error = `${msg}。${MANUAL_FALLBACK}`;
      await db.publishJob.update({ where: { id: jobId }, data: { status: "failed", error } });
      return { jobId, platform: job.platform, status: "failed", error };
    }
  }

  /** 扫一遍，把该发的都发掉；一个失败不影响其他 */
  async function runDue(now = new Date()): Promise<RunResult[]> {
    const out: RunResult[] = [];
    for (const j of await dueJobs(now)) out.push(await runJob(j.id, { now }));
    return out;
  }

  /** 失败的任务重新放回「已批准」，下一轮（或立即发布）再试 */
  async function retry(jobId: string) {
    const r = await db.publishJob.updateMany({ where: { id: jobId, status: "failed" }, data: { status: "approved", error: null } });
    if (r.count === 0) throw new Error("只有发布失败的任务可以重试");
  }

  /** 用户自己在平台上发好了：记成已发布，链接可选 */
  async function markManual(jobId: string, url?: string | null) {
    const clean = url?.trim() || null;
    if (clean && !/^https?:\/\//i.test(clean)) throw new Error("链接要以 http:// 或 https:// 开头");
    const r = await db.publishJob.updateMany({
      where: { id: jobId, status: { in: ["approved", "failed", "awaiting_click"] } },
      data: { status: "published", url: clean, error: null },
    });
    if (r.count === 0) throw new Error("只有已批准、发布失败或等你点发布的任务可以标记为已发布");
  }

  const hasConnector = (platform: PlatformKey | string) => byPlatform.has(platform);

  return { dueJobs, runJob, runDue, retry, markManual, hasConnector, readyPlatforms };
}
