/**
 * 清清启动时开一个发布定时器：每分钟扫一次，把到点的已批准任务交给各平台连接器发出去。
 * 只在 Node 运行时跑；设 PUBLISH_LOOP=off 可以关掉（比如只想手动点「立即发布」）。
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.PUBLISH_LOOP === "off") return;
  const g = globalThis as unknown as { qingqingPublishLoop?: NodeJS.Timeout };
  if (g.qingqingPublishLoop) return;
  const { prisma } = await import("./server/app");
  const { publishRunner } = await import("./server/publish/runner");
  const runner = publishRunner(prisma);
  let busy = false;
  const tick = async () => {
    if (busy) return;
    busy = true;
    try {
      for (const r of await runner.runDue()) console.log(`[发布] ${r.platform} ${r.status}${r.error ? `：${r.error}` : ""}`);
    } catch (e) {
      console.error("[发布] 定时扫描出错", e);
    } finally {
      busy = false;
    }
  };
  g.qingqingPublishLoop = setInterval(tick, 60_000);
}
