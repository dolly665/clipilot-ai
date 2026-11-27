import fs from "node:fs";
import { Readable } from "node:stream";

const MIME: Record<string, string> = { mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav", mp4: "video/mp4", srt: "text/plain; charset=utf-8", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

/** 发送本地文件，支持 Range（音视频播放器拖动进度条要用） */
export function serveFile(req: Request, abs: string, opts: { downloadName?: string } = {}): Response {
  if (!fs.existsSync(abs)) return new Response("文件不存在", { status: 404 });
  const size = fs.statSync(abs).size;
  const type = MIME[abs.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream";
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes" };
  if (opts.downloadName) {
    headers["Content-Disposition"] = `attachment; filename="download.${abs.split(".").pop()}"; filename*=UTF-8''${encodeURIComponent(opts.downloadName)}`;
  }
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  if (m && (m[1] || m[2])) {
    const start = m[1] ? Number(m[1]) : Math.max(0, size - Number(m[2]));
    const end = m[1] && m[2] ? Math.min(Number(m[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    const stream = Readable.toWeb(fs.createReadStream(abs, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) } });
  }
  const stream = Readable.toWeb(fs.createReadStream(abs)) as ReadableStream;
  return new Response(stream, { headers: { ...headers, "Content-Length": String(size) } });
}
