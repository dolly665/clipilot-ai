import fs from "node:fs";
import path from "node:path";

export type Prompt = { name: string; version: number; system: string; user: string };

const PROMPTS_DIR = path.resolve(process.cwd(), "prompts");

/** 列出某个任务的全部版本号（升序） */
export function promptVersions(name: string, dir = PROMPTS_DIR): number[] {
  const d = path.join(dir, name);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .map((f) => /^v(\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number)
    .sort((a, b) => a - b);
}

/** 读取提示词：默认最新版本；环境变量 PROMPT_<NAME>=vN 可固定版本 */
export function loadPrompt(name: string, opts: { version?: number; dir?: string } = {}): Prompt {
  const dir = opts.dir ?? PROMPTS_DIR;
  const envKey = `PROMPT_${name.toUpperCase().replace(/-/g, "_")}`;
  const pinned = process.env[envKey]?.replace(/^v/, "");
  const versions = promptVersions(name, dir);
  const version = opts.version ?? (pinned ? Number(pinned) : versions.at(-1));
  if (version === undefined || !versions.includes(version)) {
    throw new Error(`找不到提示词 ${name} 的版本 ${version ?? "(无)"}`);
  }
  const raw = fs.readFileSync(path.join(dir, name, `v${version}.md`), "utf8");
  const { system, user } = splitSections(raw, `${name}/v${version}`);
  return { name, version, system, user };
}

function splitSections(raw: string, label: string) {
  const m = /^## system\s*\n([\s\S]*?)^## user\s*\n([\s\S]*)$/m.exec(raw);
  if (!m?.[1] || !m[2]) throw new Error(`提示词 ${label} 缺少 "## system" 或 "## user" 段落`);
  return { system: m[1].trim(), user: m[2].trim() };
}

/** 替换 {{变量}}；模板里用到但没提供的变量直接报错，避免悄悄发出半截提示词 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`提示词变量 {{${key}}} 没有提供`);
    return v;
  });
}
