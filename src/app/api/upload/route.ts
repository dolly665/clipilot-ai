import { randomUUID } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as NodeReadableStream } from "node:stream/web";
import { runInBackground, sources } from "@/server/app";
import { AUDIO_EXTS, VIDEO_EXTS } from "@/server/sources";
import { resolveData, tempUploadPath } from "@/server/storage";

/**
 * 上传音频 / 视频：请求体直接是文件内容，边收边写到临时文件，不整块读进内存。
 * 文件名放在 ?name= 里。成功后返回 { id }，后台开始识别和粗剪。
 */
export async function POST(req: Request) {
  const name = new URL(req.url).searchParams.get("name")?.trim() || "upload";
  if (!AUDIO_EXTS.test(name) && !VIDEO_EXTS.test(name)) {
    return Response.json({ error: "不认识的文件类型。音频支持 mp3、m4a、wav、flac 等；长文本请用 .txt / .md。" }, { status: 400 });
  }
  if (VIDEO_EXTS.test(name)) return Response.json({ error: "视频会在下一步接入，现在先支持音频。" }, { status: 400 });
  if (!req.body) return Response.json({ error: "没有收到文件" }, { status: 400 });

  const tmp = resolveData(tempUploadPath(`${randomUUID()}${path.extname(name).toLowerCase()}`));
  await fsp.mkdir(path.dirname(tmp), { recursive: true });
  try {
    await pipeline(Readable.fromWeb(req.body as unknown as NodeReadableStream), fs.createWriteStream(tmp));
    const s = await sources.createMedia({ name, tempPath: tmp });
    runInBackground(`处理音频 ${s.id}`, () => sources.processAudio(s.id));
    return Response.json({ id: s.id });
  } catch (e) {
    await fsp.rm(tmp, { force: true });
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
