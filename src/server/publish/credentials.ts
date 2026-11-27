import fs from "node:fs/promises";
import path from "node:path";
import { dataDir } from "../env";

/**
 * 平台授权（刷新令牌等）存在本机数据目录 DATA_DIR/credentials/<平台>.json，
 * 不进数据库、不进 git，文件权限只给自己读写。
 */
function file(name: string, root: string) {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`不合法的名字：${name}`);
  return path.join(root, "credentials", `${name}.json`);
}

export async function readCredential<T>(name: string, root = dataDir()): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(file(name, root), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeCredential(name: string, value: unknown, root = dataDir()) {
  const f = file(name, root);
  await fs.mkdir(path.dirname(f), { recursive: true });
  await fs.writeFile(f, JSON.stringify(value, null, 2), { mode: 0o600 });
}

export async function deleteCredential(name: string, root = dataDir()) {
  await fs.rm(file(name, root), { force: true });
}
