/**
 * 用作者认可的样本检验润色效果（会调用真实模型、产生费用）：
 *   npx tsx scripts/polish-eval.ts [样本名，默认 xiuxing]
 * 读 templates/voice/samples/<样本>.raw.txt，润色后和 <样本>.approved.txt（有的话）对比打分，
 * 输出写到 data/polish-eval/<样本>.<提示词版本>.txt。用 PROMPT_POLISH=v2 可以对比旧版本。
 * 注意：v3 的示例取自 xiuxing 样本，这个样本上的分数会偏高；新样本更能说明问题。
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { defaultProvider } from "../src/server/ai";
import { polishText } from "../src/server/ai/tasks";
import { cleanTranscriptExport } from "../src/domain/polish/clean";
import { scorePolish } from "../src/domain/polish/score";

const name = process.argv[2] ?? "xiuxing";
const dir = "templates/voice/samples";
const raw = fs.readFileSync(path.join(dir, `${name}.raw.txt`), "utf8");
const approvedFile = path.join(dir, `${name}.approved.txt`);
const approved = fs.existsSync(approvedFile) ? fs.readFileSync(approvedFile, "utf8") : null;

const p = defaultProvider();
console.log(`提供方：${p.name} / ${p.model}`);
const cleaned = cleanTranscriptExport(raw);
const r = await polishText(cleaned.text, { provider: p });
const outDir = "data/polish-eval";
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `${name}.v${r.prompt.version}.txt`);
fs.writeFileSync(out, r.text);
console.log(`提示词 polish v${r.prompt.version}，输出：${out}`);
if (r.warnings.length) console.log("提醒：", r.warnings);
if (cleaned.removed.length) console.log("预处理去掉：", cleaned.removed);
if (approved) console.table(scorePolish(r.text, approved, cleaned.text));
else console.log("这个样本没有认可版，只输出润色结果。");
