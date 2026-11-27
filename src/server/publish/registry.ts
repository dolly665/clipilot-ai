import { publishYoutubeJob, youtubeStatus } from "./youtube";
import type { PublishConnector } from "./types";

/**
 * 已接好自动发布的平台。写好一个连接器就在这里加一行（A、B 都可以改，只改自己那一行）。
 * 不在这里、或者 ready() 为 false（还没连接账号）的平台，批准后保持「已批准」，发布中心显示成「等你手动发」。
 */
const youtubeReady = async () => (await youtubeStatus()).connected;
const youtube = (platform: "yt" | "yts"): PublishConnector => ({
  platform,
  uploadEarly: true, // 先传成私密并带 publishAt，到点由 YouTube 公开
  ready: youtubeReady,
  publish: async (db, jobId) => {
    const r = await publishYoutubeJob(db, jobId);
    return { url: r.url, warnings: r.warnings };
  },
});

export const CONNECTORS: PublishConnector[] = [youtube("yt"), youtube("yts")];
