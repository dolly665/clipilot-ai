import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./env";

/** 把相对路径解析到 DATA_DIR 内，拒绝跳出数据目录的路径 */
export function resolveData(rel: string, root = dataDir()): string {
  const abs = path.resolve(root, rel);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error(`路径越界：${rel}`);
  return abs;
}

function safeExt(name: string): string {
  const ext = path.extname(name).toLowerCase();
  return /^\.[a-z0-9]{1,8}$/.test(ext) ? ext : "";
}

/**
 * 保存原始素材：sources/<id>/original.<ext>，写完设为只读。
 * 原始文件此后不再改动，所有剪辑都在派生副本上做。
 */
export async function saveOriginal(sourceId: string, originalName: string, data: Buffer | string, root = dataDir()) {
  const rel = path.posix.join("sources", sourceId, `original${safeExt(originalName)}`);
  const abs = resolveData(rel, root);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data, { flag: "wx" });
  await fs.chmod(abs, 0o444);
  const { size } = await fs.stat(abs);
  return { rel, abs, size };
}
