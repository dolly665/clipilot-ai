import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPrisma } from "@/server/db";

/** 建一个临时 SQLite 库并推送当前 schema，测试结束后删掉 */
export function makeTestDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "qingqing-test-"));
  const url = `file:${path.join(dir, "test.db")}`;
  execFileSync(path.resolve("node_modules/.bin/prisma"), ["db", "push"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "ignore",
  });
  const prisma = createPrisma(url);
  return {
    prisma,
    dir,
    async cleanup() {
      await prisma.$disconnect();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}
