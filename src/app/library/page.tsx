import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { RegionChips, SourceStatusChip } from "@/components/ui";
import { isPlatformKey, PLATFORMS } from "@/domain/platforms";
import { CONTENT_TYPES } from "@/domain/types";
import { prisma } from "@/server/app";
import { readDraft } from "@/server/sources";

const DOT: Record<string, string> = { pending_review: "warn", approved: "ok", compliance_blocked: "bad", failed: "bad", published: "ok" };

export default async function LibraryPage() {
  const list = await prisma.source.findMany({ orderBy: { createdAt: "desc" }, include: { jobs: true } });
  return (
    <>
      <PageHead
        title="内容库"
        desc="每条素材是唯一源头，它派生的长文、短帖和各平台发布都挂在下面。"
        actions={<Link className="btn primary" href="/new">＋ 上传新内容</Link>}
      />
      {list.length === 0 ? (
        <section className="panel" style={{ textAlign: "center", padding: 40 }}>
          <b>还没有内容</b>
          <p style={{ color: "var(--muted)" }}>拖进第一条长文试试。</p>
          <Link className="btn primary" href="/new">上传新内容</Link>
        </section>
      ) : (
        <div className="tablewrap">
          <table>
            <thead><tr><th>内容</th><th>类型</th><th>主题</th><th>区域</th><th>各平台</th><th>状态</th></tr></thead>
            <tbody>
              {list.map((s) => {
                const d = readDraft(s);
                const href = ["processing", "drafting", "prefilled"].includes(s.status) ? `/new/${s.id}` : `/library/${s.id}`;
                return (
                  <tr key={s.id}>
                    <td>
                      <Link href={href} style={{ color: "inherit", textDecoration: "none", fontWeight: 500 }}>{d.title || s.originalName}</Link>
                      <div className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{s.createdAt.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</div>
                    </td>
                    <td>{CONTENT_TYPES[d.type]}</td>
                    <td>{d.topic}</td>
                    <td><RegionChips regions={d.regions} /></td>
                    <td>
                      <div className="ptags">
                        {s.jobs.filter((j) => isPlatformKey(j.platform)).map((j) => (
                          <span key={j.id} className={`ptag ${j.status === "compliance_blocked" ? "blocked" : ""}`}>
                            <span className={`dot ${DOT[j.status] ?? "acc"}`} />
                            {PLATFORMS[j.platform as keyof typeof PLATFORMS].name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td><SourceStatusChip status={s.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
