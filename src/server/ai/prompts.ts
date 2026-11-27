import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../env";

export type Prompt = { name: string; version: number; system: string; user: string };

const PROMPTS_DIR = path.resolve(/*turbopackIgnore: true*/ process.cwd(), "prompts");

/**
 * 你在「模板」页改出来的版本存在数据目录（DATA_DIR/prompts/<任务>/v<N>.md），不进 git，
 * 这样 git pull 永远不会和你的改动冲突。版本号和仓库里的版本共用一个序列，取最大的那个。
 */
export function userPromptsDir(): string {
  return path.join(dataDir(), "prompts");
}

type Opts = { dir?: string; userDir?: string | null };

/** 指定了 dir（测试用）时默认不看数据目录 */
function dirs(opts: Opts): { repo: string; user: string | null } {
  return { repo: opts.dir ?? PROMPTS_DIR, user: opts.userDir !== undefined ? opts.userDir : opts.dir ? null : userPromptsDir() };
}

function versionsIn(d: string | null, name: string): number[] {
  if (!d) return [];
  const dir = path.join(d, name);
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir)
    .map((f) => /^v(\d+)\.md$/.exec(f)?.[1])
    .filter((v): v is string => v !== undefined)
    .map(Number);
}

export type PromptVersion = { version: number; source: "repo" | "user"; /** 仓库里也有同号版本，被你的版本盖住了 */ shadowed?: boolean };

/** 一个任务的全部版本（升序），标出哪些是你在清清里改的 */
export function promptVersionList(name: string, opts: Opts = {}): PromptVersion[] {
  const { repo, user } = dirs(opts);
  const r = new Set(versionsIn(repo, name));
  const u = new Set(versionsIn(user, name));
  return [...new Set([...r, ...u])]
    .sort((a, b) => a - b)
    .map((version) => (u.has(version) ? { version, source: "user" as const, shadowed: r.has(version) || undefined } : { version, source: "repo" as const }));
}

/** 列出某个任务的全部版本号（升序） */
export function promptVersions(name: string, dir?: string): number[] {
  return promptVersionList(name, { dir }).map((v) => v.version);
}

/** 全部任务名（仓库里有目录的） */
export function promptNames(dir = PROMPTS_DIR): string[] {
  return fs
    .readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && versionsIn(dir, e.name).length > 0)
    .map((e) => e.name)
    .sort();
}

/** 当前生效的版本：环境变量 PROMPT_<NAME>=vN 固定的，否则最新 */
export function activePromptVersion(name: string, opts: Opts = {}): number | undefined {
  const envKey = `PROMPT_${name.toUpperCase().replace(/-/g, "_")}`;
  const pinned = process.env[envKey]?.replace(/^v/, "");
  return pinned ? Number(pinned) : promptVersionList(name, opts).at(-1)?.version;
}

/** 提示词文件原文（模板页显示和编辑用） */
export function readPromptRaw(name: string, version: number, opts: Opts = {}): string {
  const { repo, user } = dirs(opts);
  const userFile = user && path.join(user, name, `v${version}.md`);
  const file = userFile && fs.existsSync(/*turbopackIgnore: true*/ userFile) ? userFile : path.join(repo, name, `v${version}.md`);
  return fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8");
}

/** 读取提示词：默认最新版本；环境变量 PROMPT_<NAME>=vN 可固定版本 */
export function loadPrompt(name: string, opts: Opts & { version?: number } = {}): Prompt {
  const versions = promptVersionList(name, opts).map((v) => v.version);
  const envKey = `PROMPT_${name.toUpperCase().replace(/-/g, "_")}`;
  const pinned = process.env[envKey]?.replace(/^v/, "");
  const version = opts.version ?? (pinned ? Number(pinned) : versions.at(-1));
  if (version === undefined || !versions.includes(version)) {
    throw new Error(`找不到提示词 ${name} 的版本 ${version ?? "(无)"}`);
  }
  const { system, user } = splitSections(readPromptRaw(name, version, opts), `${name}/v${version}`);
  return { name, version, system, user };
}

function splitSections(raw: string, label: string) {
  const m = /^## system\s*\n([\s\S]*?)^## user\s*\n([\s\S]*)$/m.exec(raw);
  if (!m?.[1] || !m[2]) throw new Error(`提示词 ${label} 缺少 "## system" 或 "## user" 段落`);
  return { system: m[1].trim(), user: m[2].trim() };
}

/** 提示词里用到的 {{变量}} */
export function promptVars(raw: string): string[] {
  return [...new Set([...raw.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]!))];
}

/**
 * 把你改过的提示词存成新版本（版本号 = 现有最大 + 1），旧版本不动。
 * 只能用最新版本已经用到的变量，否则生成时代码给不出这个变量会直接报错。
 */
export function savePromptVersion(name: string, raw: string, opts: Opts = {}): number {
  if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`不合法的任务名：${name}`);
  const list = promptVersionList(name, opts);
  const latest = list.at(-1);
  if (!latest) throw new Error(`没有这个提示词：${name}`);
  const text = raw.replace(/\r\n?/g, "\n").trim() + "\n";
  splitSections(text, name);
  const allowed = new Set(promptVars(readPromptRaw(name, latest.version, opts)));
  const unknown = promptVars(text).filter((v) => !allowed.has(v));
  if (unknown.length) throw new Error(`这些变量代码里没有提供：${unknown.map((v) => `{{${v}}}`).join("、")}。可用的是：${[...allowed].map((v) => `{{${v}}}`).join("、")}`);
  if (text === readPromptRaw(name, latest.version, opts).replace(/\r\n?/g, "\n").trim() + "\n") throw new Error("和最新版本一样，没有改动");
  const { user } = dirs(opts);
  if (!user) throw new Error("没有可写的提示词目录");
  const version = latest.version + 1;
  const file = path.join(user, name, `v${version}.md`);
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ file, text, { flag: "wx" });
  return version;
}

/** 替换 {{变量}}；模板里用到但没提供的变量直接报错，避免悄悄发出半截提示词 */
export function render(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const v = vars[key];
    if (v === undefined) throw new Error(`提示词变量 {{${key}}} 没有提供`);
    return v;
  });
}
