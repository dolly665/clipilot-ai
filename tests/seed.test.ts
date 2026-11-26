import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DEFAULT_SENSITIVE_WORDS } from "@/domain/compliance";
import { seed } from "@/server/seed";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
beforeAll(() => { db = makeTestDb(); });
afterAll(async () => { await db.cleanup(); });

describe("seed", () => {
  it("写入默认敏感词，重复执行不重复写，也不恢复用户删掉的词以外的改动", async () => {
    await seed(db.prisma);
    expect(await db.prisma.sensitiveWord.count()).toBe(DEFAULT_SENSITIVE_WORDS.length);
    await db.prisma.sensitiveWord.create({ data: { word: "因果" } });
    const second = await seed(db.prisma);
    expect(second.words).toBe(0);
    expect(await db.prisma.sensitiveWord.count()).toBe(DEFAULT_SENSITIVE_WORDS.length + 1);
  });

  it("每个 Source + 平台只有一条发布任务", async () => {
    const s = await db.prisma.source.create({
      data: { kind: "text", originalName: "a.md", filePath: "sources/x/a.md", mimeType: "text/markdown" },
    });
    await db.prisma.publishJob.create({ data: { sourceId: s.id, platform: "gzh" } });
    await expect(db.prisma.publishJob.create({ data: { sourceId: s.id, platform: "gzh" } })).rejects.toThrow();
  });
});
