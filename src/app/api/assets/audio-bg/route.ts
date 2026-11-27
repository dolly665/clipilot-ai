import { serveFile } from "@/server/serve-file";
import { audioBackground } from "@/server/storage";

/** 音频配画面用的背景照片（设置页预览） */
export async function GET(req: Request) {
  const f = await audioBackground();
  if (!f) return new Response("还没有设置照片", { status: 404 });
  return serveFile(req, f);
}
