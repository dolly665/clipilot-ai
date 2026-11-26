import "dotenv/config";
import { createPrisma } from "../src/server/db";
import { seed } from "../src/server/seed";

const prisma = createPrisma();
seed(prisma)
  .then((r) => console.log("seed 完成", r))
  .finally(() => prisma.$disconnect());
