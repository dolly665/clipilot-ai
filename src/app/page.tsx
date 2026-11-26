import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { SourceStatusChip } from "@/components/ui";
import { prisma } from "@/server/app";
import { readDraft } from "@/server/sources";

const FLOW: [string, "you" | "auto", string, string][] = [
  ["you", "you", "录制 / 写作", "横屏、竖屏分开录；长文直接写"],
  ["you", "you", "拖进清清", "视频、音频、长文本都行"],
  ["auto", "auto", "预填 + 合规", "标题、类型、主题、平台；国内敏感词检查"],
  ["auto", "auto", "生成全部成品", "长文、知乎、短帖……"],
  ["you", "you", "审核", "一页看完，一键批准"],
];

export default async function DashboardPage() {
  const [review, prefilled, recent] = await Promise.all([
    prisma.source.findMany({ where: { status: "review" } }),
    prisma.source.findMany({ where: { status: "prefilled" } }),
    prisma.source.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
  ]);
  const todo = [...prefilled.map((s) => ({ s, href: `/new/${s.id}`, what: "确认发布信息" })), ...review.map((s) => ({ s, href: `/library/${s.id}`, what: "审核成品" }))];
  return (
    <>
      <PageHead
        eyebrow={new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "short" })}
        title="你好，时予清"
        desc={`今天有 ${review.length} 条等你审核，${prefilled.length} 条等你确认发布信息。`}
        actions={<Link className="btn primary" href="/new">＋ 上传新内容</Link>}
      />
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>一条内容走完的全流程</h2>
        <div className="flow" style={{ gridTemplateColumns: `repeat(${FLOW.length},minmax(0,1fr))` }}>
          {FLOW.map(([k, who, b, span]) => (
            <div key={b} className={`step ${k}`}>
              <div className="who">{who === "you" ? "你" : "清清"}</div>
              <b>{b}</b>
              <span>{span}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="grid g2">
        <section className="panel">
          <h2>需要你处理</h2>
          {todo.length === 0 ? <p style={{ color: "var(--muted)", margin: 0 }}>没有待办。</p> : (
            <div className="row-list">
              {todo.map(({ s, href, what }) => (
                <div key={s.id}>
                  <span className="dot warn" />
                  <div className="t"><b>{readDraft(s).title || s.originalName}</b><span>{what}</span></div>
                  <Link className="btn sm" href={href}>去处理</Link>
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="panel">
          <h2>最近内容</h2>
          {recent.length === 0 ? <p style={{ color: "var(--muted)", margin: 0 }}>还没有内容。</p> : (
            <div className="row-list">
              {recent.map((s) => (
                <div key={s.id}>
                  <div className="t"><b>{readDraft(s).title || s.originalName}</b><span>{s.createdAt.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></div>
                  <SourceStatusChip status={s.status} />
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </>
  );
}
