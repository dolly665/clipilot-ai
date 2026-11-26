import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";
import { databaseUrl } from "./env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function createPrisma(url = databaseUrl()): PrismaClient {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}

/** 开发时 Next 热重载会重复执行模块，这里复用同一个连接 */
export const prisma: PrismaClient = globalForPrisma.prisma ?? createPrisma();
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
