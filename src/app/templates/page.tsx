import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { activePromptVersion, promptNames, promptVars, promptVersionList, readPromptRaw } from "@/server/ai/prompts";
import { PromptEditor } from "./PromptEditor";

export const dynamic = "force-dynamic";

/** 任务名 → 分组和显示名 */
const META: Record<string, [string, string]> = {
  "text-kind": ["文字", "判断：转写稿还是成稿"],
  polish: ["文字", "润色成底稿"],
  longform: ["文字", "长文排版"],
  "short-posts": ["文字", "短帖和图卡"],
  zhihu: ["文字", "知乎问题和想法"],
  "spoken-article": ["音视频", "口播整理成文章"],
  shownotes: ["音视频", "播客节目说明"],
  "video-copy": ["音视频", "视频平台文案"],
  understand: ["通用", "预填：标题、类型、主题"],
};
const GROUPS = ["通用", "文字", "音视频", "其他"];

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ t?: string; v?: string; saved?: string }> }) {
  const sp = await searchParams;
  const names = promptNames();
  const items = names
    .map((n) => ({ name: n, group: META[n]?.[0] ?? "其他", label: META[n]?.[1] ?? n, versions: promptVersionList(n), active: activePromptVersion(n) }))
    .sort((a, b) => GROUPS.indexOf(a.group) - GROUPS.indexOf(b.group));
  const cur = items.find((i) => i.name === sp.t) ?? items[0]!;
  const latest = cur.versions.at(-1)!.version;
  const v = cur.versions.find((x) => String(x.version) === sp.v)?.version ?? cur.active ?? latest;
  const raw = readPromptRaw(cur.name, v);
  const vars = promptVars(readPromptRaw(cur.name, latest));

  return (
    <>
      <PageHead title="模板" desc="每类成品一个提示词，生成时按它来写。改了会存成新版本，旧版本和已生成的内容都不受影响。" />
      <div className="grid" style={{ gridTemplateColumns: "minmax(0,240px) minmax(0,1fr)" }}>
        <section className="panel tpl-list" style={{ padding: 8, alignSelf: "start" }}>
          {items.map((i, k) => (
            <div key={i.name}>
              {i.group !== items[k - 1]?.group && <div className="grp">{i.group}</div>}
              <Link href={`/templates?t=${i.name}`} scroll={false} className={i.name === cur.name ? "on" : ""}>
                <span>{i.label}</span>
                <span className="mono" style={{ fontSize: 11 }}>v{i.active}</span>
              </Link>
            </div>
          ))}
        </section>
        <section className="panel" style={{ minWidth: 0 }}>
          <h2>
            <span>{cur.label} <small className="mono">{cur.name}</small></span>
            <span className="chips" style={{ margin: 0 }}>
              {cur.versions.map((x) => (
                <Link key={x.version} href={`/templates?t=${cur.name}&v=${x.version}`} scroll={false} className={`chip ${x.version === v ? "acc" : ""}`} title={x.source === "user" ? "你在清清里改的" : "仓库里的版本"}>
                  v{x.version}{x.source === "user" ? " · 你改的" : ""}{x.version === cur.active ? " · 在用" : ""}
                </Link>
              ))}
            </span>
          </h2>
          {sp.saved && cur.versions.some((x) => String(x.version) === sp.saved) && (
            <p style={{ fontSize: 13, color: "var(--ok)", margin: "0 0 8px" }}>已存为 v{sp.saved}，以后生成都用这个版本。旧版本还在，点上面的版本号能看。</p>
          )}
          {cur.versions.some((x) => x.shadowed) && (
            <p style={{ fontSize: 12, color: "var(--warn)", margin: "0 0 8px" }}>仓库里后来也出了同号的版本，现在用的是你改的那份。</p>
          )}
          <PromptEditor key={`${cur.name}-${v}`} name={cur.name} body={raw} isLatest={v === latest} vars={vars} />
        </section>
      </div>
    </>
  );
}
