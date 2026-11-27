import type { PublishConnector } from "./types";
import { youtubeConnectors, youtubeStatus } from "./youtube";

/**
 * 已接好自动发布的平台。写好一个连接器就在这里加一行（A、B 都可以改，只改自己那一行）。
 * 不在这里、或者 ready() 为 false（还没连接账号）的平台，批准后保持「已批准」，发布中心显示成「等你手动发」。
 */
const youtubeReady = async () => {
  const s = await youtubeStatus();
  return s.configured && s.connected;
};

export const CONNECTORS: PublishConnector[] = [
  ...youtubeConnectors.map((c) => ({ ready: youtubeReady, ...c })), // A：YouTube、YouTube Shorts（连接器自带 ready 时用它自己的）
];
