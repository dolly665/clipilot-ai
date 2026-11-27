import fs from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createFakeProvider } from "@/server/ai/providers/fake";
import { seed } from "@/server/seed";
import { sourceService } from "@/server/sources";
import { makeTestDb } from "./helpers/test-db";

let db: ReturnType<typeof makeTestDb>;
let svc: ReturnType<typeof sourceService>;
beforeAll(async () => {
  db = makeTestDb();
  await seed(db.prisma);
  svc = sourceService({ db: db.prisma, provider: createFakeProvider(), root: db.dir });
});
afterAll(async () => { await db.cleanup(); });

const TEXT = "嗯今天想聊聊边界感然后就是说很多人不敢拒绝其实清楚的边界反而让关系更长久";

describe("取消一条内容", () => {
  it("处理中就能取消：记录、底稿、只读原件都删掉", async () => {
    const s = await svc.createText({ name: "a.txt", text: TEXT });
    await svc.processText(s.id);
    const dir = path.join(db.dir, "sources", s.id);
    expect(fs.existsSync(dir)).toBe(true);

    await svc.remove(s.id);
    expect(await db.prisma.source.findUnique({ where: { id: s.id } })).toBeNull();
    expect(await db.prisma.manuscript.count({ where: { sourceId: s.id } })).toBe(0);
    expect(fs.existsSync(dir)).toBe(false);
  });

  it("后台任务碰到已取消的内容不会再写回", async () => {
    const s = await svc.createText({ name: "b.txt", text: TEXT });
    await svc.remove(s.id);
    await expect(svc.processText(s.id)).rejects.toThrow();
    expect(await db.prisma.source.count({ where: { id: s.id } })).toBe(0);
  });

  it("已批准的内容不能取消", async () => {
    const s = await svc.createText({ name: "c.txt", text: TEXT });
    await db.prisma.source.update({ where: { id: s.id }, data: { status: "approved" } });
    await expect(svc.remove(s.id)).rejects.toThrow("已批准");
  });
});
