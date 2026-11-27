import { derivativeCopyText, DERIVATIVE_LABEL, type DerivativeContent } from "@/domain/derivatives";
import { prisma } from "@/server/app";
import { platformName } from "@/server/sources";

/** 下载单个文字成品为 Markdown */
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await prisma.derivative.findUnique({ where: { id }, include: { source: true } });
  if (!d?.content) return new Response("没有这个成品", { status: 404 });
  const c = d.content as unknown as DerivativeContent;
  const label = d.platform && (c.kind === "post" || c.kind === "video_copy") ? platformName(d.platform) : DERIVATIVE_LABEL[c.kind];
  const name = `${d.source.title || "清清"}-${label}.md`.replace(/[\\/:*?"<>|]/g, "_");
  return new Response(derivativeCopyText(c), {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="qingqing-${d.id}.md"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
