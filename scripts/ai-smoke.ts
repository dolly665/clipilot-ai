/**
 * 用真实提供方跑一遍文本链路的四个任务（会产生费用）。
 *   AI_PROVIDER=anthropic AI_MODEL=... npx tsx scripts/ai-smoke.ts [文本文件]
 */
import "dotenv/config";
import fs from "node:fs";
import { defaultProvider } from "../src/server/ai";
import { articleToMarkdown } from "../src/domain/longform";
import { layoutLongform, shortPosts, understand, zhihu } from "../src/server/ai/tasks";

const file = process.argv[2];
const text = file
  ? fs.readFileSync(file, "utf8")
  : "关系里的边界感：怎么拒绝才不伤人\n\n很多人不敢拒绝，是怕关系变差。\n\n其实清楚的边界，反而让关系更长久。";

const p = defaultProvider();
console.log(`提供方：${p.name} / ${p.model}`);
const u = await understand({ kind: "text", text });
console.log("预填：", u.data);
const input = { text, title: u.data.title, topic: u.data.topic };
const [l, z, s] = await Promise.all([layoutLongform(input), zhihu(input), shortPosts(input)]);
console.log("\n长文：\n" + articleToMarkdown(l.data));
console.log("知乎：", z.data);
console.log("短帖：", s.data);
