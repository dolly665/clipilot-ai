import { prisma } from "@/server/app";
import { serveFile } from "@/server/serve-file";
import { resolveData } from "@/server/storage";

/** 文件类成品（播客音频等）：?download=1 时作为下载 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await prisma.derivative.findUnique({ where: { id: (await params).id }, include: { source: true } });
  if (!d?.filePath) return new Response("没有这个文件", { status: 404 });
  const download = new URL(req.url).searchParams.get("download") === "1";
  const ext = d.filePath.split(".").pop();
  return serveFile(req, resolveData(d.filePath), download ? { downloadName: `${d.source.title || "清清"}-播客.${ext}` } : {});
}
