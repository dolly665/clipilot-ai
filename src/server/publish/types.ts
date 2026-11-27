import type { PlatformKey } from "@/domain/platforms";
import type { PrismaClient } from "@/generated/prisma/client";

/**
 * 一个平台的自动发布连接器（A 负责写，放在 src/server/publish/<平台>.ts）。
 * 只管把已批准任务的成品发到平台上：不改 PublishJob 的状态（执行器来改），
 * 出错直接抛错，错误信息是给用户看的中文。
 */
export type PublishConnector = {
  platform: PlatformKey;
  /** true：批准后马上上传，由平台自己按排期时间公开（比如 YouTube 的 publishAt）；false：到排期时间才发 */
  uploadEarly?: boolean;
  publish(db: PrismaClient, jobId: string, opts: { now: Date }): Promise<{ url: string | null; warnings: string[] }>;
};
