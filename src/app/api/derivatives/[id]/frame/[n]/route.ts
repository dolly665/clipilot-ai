import { prisma } from "@/server/app";
import { serveFile } from "@/server/serve-file";
import { resolveData } from "@/server/storage";

/** 封面候选帧：第 n 张（从 0 开始） */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; n: string }> }) {
  const { id, n } = await params;
  const d = await prisma.derivative.findUnique({ where: { id } });
  const frames = (d?.content as { kind?: string; frames?: string[] } | null)?.frames;
  const rel = d && (d.content as { kind?: string }).kind === "cover" ? frames?.[Number(n)] : undefined;
  if (!rel) return new Response("没有这张图", { status: 404 });
  return serveFile(req, resolveData(rel));
}
