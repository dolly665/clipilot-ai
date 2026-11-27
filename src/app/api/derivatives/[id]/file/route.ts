import { DERIVATIVE_LABEL, type DerivativeContent } from "@/domain/derivatives";
import { prisma } from "@/server/app";
import { serveFile } from "@/server/serve-file";
import { resolveData } from "@/server/storage";

/** 文件类成品（播客音频、成片、字幕等）：?download=1 时作为下载 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await prisma.derivative.findUnique({ where: { id: (await params).id }, include: { source: true } });
  if (!d?.filePath) return new Response("没有这个文件", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const ext = d.filePath.split(".").pop();
  const c = d.content as unknown as DerivativeContent | null;
  const label = c?.kind === "video" ? (c.variant === "burned" ? "成片-带字幕" : "成片") : c ? DERIVATIVE_LABEL[c.kind] : "文件";
  const name = `${d.source.title || "清清"}-${label}.${ext}`.replace(/[\\/:*?"<>|]/g, "_");
  return serveFile(req, resolveData(d.filePath), download ? { downloadName: name } : {});
}
