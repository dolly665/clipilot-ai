import "server-only";
import { prisma } from "./db";
import { sourceService } from "./sources";

/** 应用里用的默认服务实例（真实数据库 + 环境变量里配置的 AI 提供方） */
export const sources = sourceService({ db: prisma });
export { prisma };

/** 在当前进程里后台跑一个任务（本机单进程运行，状态都写在数据库里，页面轮询刷新） */
export function runInBackground(label: string, task: () => Promise<unknown>) {
  void task().catch((e) => console.error(`[清清] 后台任务失败：${label}`, e));
}
