import fs from "node:fs/promises";
import path from "node:path";
import type { DerivativeContent } from "@/domain/derivatives";
import { prisma } from "@/server/app";
import { derivativePath, resolveData } from "@/server/storage";

/** 保存页面上叠好标题的封面（JPEG），自动发布时用它 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const d = await prisma.derivative.findUnique({ where: { id: (await params).id }, include: { source: true } });
  const c = d?.content as unknown as DerivativeContent | null;
  if (!d || c?.kind !== "cover") return Response.json({ error: "没有这个封面" }, { status: 404 });
  if (d.source.status === "approved") return Response.json({ error: "已批准的内容不能再改封面" }, { status: 400 });
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length < 1000 || buf.length > 8 * 1024 * 1024 || buf[0] !== 0xff || buf[1] !== 0xd8) return Response.json({ error: "封面图片不对" }, { status: 400 });
  const rel = derivativePath(d.sourceId, "cover/cover.jpg");
  const abs = resolveData(rel);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, buf);
  await prisma.derivative.update({ where: { id: d.id }, data: { content: { ...c, png: rel } } });
  return Response.json({ ok: true });
}
