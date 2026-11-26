import type { PrismaClient } from "@/generated/prisma/client";
import { DEFAULT_SENSITIVE_WORDS } from "@/domain/compliance";

/** 幂等：只补缺失的默认数据，不覆盖用户在设置页改过的内容 */
export async function seed(prisma: PrismaClient) {
  let words = 0;
  for (const word of DEFAULT_SENSITIVE_WORDS) {
    const existed = await prisma.sensitiveWord.findUnique({ where: { word } });
    if (!existed) {
      await prisma.sensitiveWord.create({ data: { word } });
      words++;
    }
  }
  return { words };
}
