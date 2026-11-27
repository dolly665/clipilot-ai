import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { PageHead } from "@/components/PageHead";
import { SourceStatusChip } from "@/components/ui";
import { charCount } from "@/domain/chunk";
import { prisma } from "@/server/app";
import { readDraft } from "@/server/sources";

/** 底稿库：每条文本素材最新的底稿，可以搜索、复制，点进去看成品 */
export default async function ManuscriptsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim();
  const sources = await prisma.source.findMany({
    where: { kind: "text", manuscripts: { some: {} } },
    orderBy: { updatedAt: "desc" },
    include: { manuscripts: { orderBy: { version: "desc" }, take: 1 } },
  });
  const rows = sources
    .map((s) => ({ s, m: s.manuscripts[0]!, title: readDraft(s).title || s.originalName }))
    .filter(({ m, title }) => !q || title.includes(q) || m.body.includes(q));

  return (
    <>
      <PageHead
        title="底稿库"
        desc="你给的长文字理顺之后的底稿都在这里。原文不动，底稿每次修改都留版本。"
        actions={<Link className="btn primary" href="/new">＋ 新底稿</Link>}
      />
      <form className="toolbar" action="/manuscripts">
        <div className="inline" style={{ flex: 1, maxWidth: 420 }}>
          <input name="q" defaultValue={q} placeholder="搜标题或正文" aria-label="搜索底稿" />
          <button className="btn">搜索</button>
        </div>
        {q && <Link className="btn ghost sm" href="/manuscripts">清除</Link>}
      </form>
      {rows.length === 0 ? (
        <section className="panel" style={{ textAlign: "center", padding: 40 }}>
          <b>{q ? "没有找到" : "还没有底稿"}</b>
          <p style={{ color: "var(--muted)" }}>{q ? "换个词试试。" : "把一段录音转出来的文字贴进来试试。"}</p>
        </section>
      ) : (
        <div className="grid g2">
          {rows.map(({ s, m, title }) => {
            const href = ["processing", "drafting", "prefilled"].includes(s.status) ? `/new/${s.id}` : `/library/${s.id}?tab=manuscript`;
            return (
              <section className="panel" key={s.id} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
                  <Link href={href} style={{ color: "inherit", textDecoration: "none", fontWeight: 700, fontSize: 15 }}>{title}</Link>
                  <SourceStatusChip status={s.status} />
                </div>
                <div style={{ fontSize: 13, color: "var(--muted)", whiteSpace: "pre-wrap", maxHeight: 88, overflow: "hidden" }}>{[...m.body].slice(0, 160).join("")}…</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>
                    {charCount(m.body)} 字 · v{m.version} · {s.textMode === "polish" ? "已润色" : "原样"} · {m.createdAt.toLocaleDateString("zh-CN")}
                  </span>
                  <span style={{ display: "flex", gap: 6 }}>
                    <CopyButton text={m.body} label="复制底稿" />
                    <Link className="btn sm" href={href}>打开</Link>
                  </span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
