import type { PublishConnector } from "./types";
import { youtubeConnectors } from "./youtube";

/**
 * 已接好自动发布的平台。写好一个连接器就在这里加一行（A、B 都可以改，只改自己那一行）。
 * 不在这里的平台，批准后保持「已批准」，发布中心显示成「等你手动发」。
 */
export const CONNECTORS: PublishConnector[] = [
  ...youtubeConnectors, // A：YouTube、YouTube Shorts
];
