import path from "node:path";

/** 本机数据目录（素材、派生文件、数据库）。所有文件路径都相对它存储。 */
export function dataDir(): string {
  return path.resolve(process.env.DATA_DIR ?? "./data");
}

export function databaseUrl(): string {
  return process.env.DATABASE_URL ?? `file:${path.join(dataDir(), "qingqing.db")}`;
}
