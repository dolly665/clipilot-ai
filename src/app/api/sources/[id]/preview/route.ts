import { prisma } from "@/server/app";
import { serveFile } from "@/server/serve-file";
import { readRoughCut } from "@/server/sources";
import { resolveData } from "@/server/storage";

/** 粗剪试听 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const s = await prisma.source.findUnique({ where: { id: (await params).id } });
  const rendered = s && readRoughCut(s)?.rendered;
  if (!rendered) return new Response("还没有试听文件", { status: 404 });
  return serveFile(req, resolveData(rendered.path));
}
