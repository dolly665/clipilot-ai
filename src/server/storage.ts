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

/** 把上传到临时目录的大文件挪成原始素材（不复制，直接改名），并设为只读 */
export async function adoptOriginal(sourceId: string, originalName: string, tempPath: string, root = dataDir()) {
  const rel = path.posix.join("sources", sourceId, `original${safeExt(originalName)}`);
  const abs = resolveData(rel, root);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.rename(tempPath, abs);
  await fs.chmod(abs, 0o444);
  const { size } = await fs.stat(abs);
  return { rel, abs, size };
}

/** 中间文件（给识别用的音轨等），可以随时删掉重建 */
export function workPath(sourceId: string, name: string) {
  return path.posix.join("work", sourceId, name);
}

/** 派生成品文件 */
export function derivativePath(sourceId: string, name: string) {
  return path.posix.join("derivatives", sourceId, name);
}

export function tempUploadPath(name: string) {
  return path.posix.join("tmp", name);
}

/**
 * 用户取消一条内容时，删掉它在数据目录里的全部文件（原件、中间文件、成品）。
 * 原件是只读的，Windows 上要先去掉只读才能删。
 */
export async function removeSourceFiles(sourceId: string, root = dataDir()) {
  if (!/^[A-Za-z0-9_-]+$/.test(sourceId)) throw new Error(`不合法的素材 ID：${sourceId}`);
  for (const dir of ["sources", "work", "derivatives"]) {
    const abs = resolveData(path.posix.join(dir, sourceId), root);
    const names = await fs.readdir(abs).catch(() => [] as string[]);
    await Promise.all(names.map((n) => fs.chmod(path.join(abs, n), 0o666).catch(() => {})));
    await fs.rm(abs, { recursive: true, force: true });
  }
}

/** 音频配画面用的背景照片：DATA_DIR/assets/audio-bg.<ext>，没有返回 null */
export async function audioBackground(root = dataDir()): Promise<string | null> {
  const dir = resolveData("assets", root);
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  const f = names.find((n) => /^audio-bg\.(jpe?g|png|webp)$/i.test(n));
  return f ? path.join(dir, f) : null;
}

/** 换背景照片：删掉旧的，写入新的 */
export async function saveAudioBackground(data: Buffer, ext: string, root = dataDir()) {
  if (!/^(jpe?g|png|webp)$/i.test(ext)) throw new Error("照片只支持 jpg、png、webp");
  const old = await audioBackground(root);
  if (old) await fs.rm(old, { force: true });
  const abs = resolveData(`assets/audio-bg.${ext.toLowerCase()}`, root);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, data);
  return abs;
}
