import Link from "next/link";
import { PageHead } from "@/components/PageHead";
import { Chip, JobChip } from "@/components/ui";
import { isPlatformKey, PLATFORMS } from "@/domain/platforms";
import { prisma } from "@/server/app";
import { publishRunner } from "@/server/publish/runner";
import { readDraft } from "@/server/sources";
import { JobActions } from "./JobActions";

export const dynamic = "force-dynamic";

const GROUPS: { title: string; desc: string; statuses: string[] }[] = [
  { title: "需要你处理", desc: "发布失败的，或者等你在平台上点「发布」的。", statuses: ["failed", "awaiting_click"] },
  { title: "排队中", desc: "已批准，等排期时间到了自动发；还没接自动发布的平台要你手动发。", statuses: ["approved", "queued", "uploading"] },
  { title: "已发布", desc: "最近 50 条。", statuses: ["published"] },
];

const fmt = (d: Date | null) => (d ? d.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "未排期");

export default async function PublishPage() {
  const runner = publishRunner(prisma);
  const jobs = await prisma.publishJob.findMany({
    where: { status: { in: GROUPS.flatMap((g) => g.statuses) } },
    include: { source: true },
    orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }],
  });
  return (
    <>
      <PageHead
        title="发布中心"
        desc="批准过的内容都在这里。接好自动发布的平台到点自动发；其他平台在审核页复制文案、下载文件手动发，发完在这里点「我已手动发布」。没有你的批准，任何内容都不会发出去。"
      />
      {jobs.length === 0 ? (
        <section className="panel" style={{ textAlign: "center", padding: 40 }}>
          <b>还没有批准的内容</b>
          <p style={{ color: "var(--muted)" }}>在审核页批准之后，会出现在这里。</p>
          <Link className="btn primary" href="/review">去审核</Link>
        </section>
      ) : (
        GROUPS.map((g) => {
          let list = jobs.filter((j) => g.statuses.includes(j.status));
          if (g.statuses.includes("published")) list = list.reverse().slice(0, 50);
          if (list.length === 0) return null;
          return (
            <section className="panel" key={g.title} style={{ marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, margin: "0 0 2px" }}>{g.title}（{list.length}）</h2>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: "0 0 12px" }}>{g.desc}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {list.map((j) => {
                  const p = isPlatformKey(j.platform) ? PLATFORMS[j.platform] : null;
                  const auto = runner.hasConnector(j.platform);
                  return (
                    <div key={j.id} style={{ display: "flex", gap: 12, justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", borderTop: "1px solid var(--line)", paddingTop: 12 }}>
                      <div style={{ minWidth: 0, flex: "1 1 240px" }}>
                        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                          {p && <Chip tone={p.region}>{p.name}</Chip>}
                          <JobChip status={j.status} />
                          {j.status === "approved" && !auto && <Chip tone="warn">等你手动发</Chip>}
                        </div>
                        <Link href={`/library/${j.sourceId}`} style={{ display: "block", marginTop: 6, fontWeight: 600 }}>{readDraft(j.source).title || j.source.originalName}</Link>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>排期：{fmt(j.scheduledAt)}</div>
                        {j.url && <a href={j.url} target="_blank" rel="noreferrer" style={{ fontSize: 12, wordBreak: "break-all" }}>{j.url}</a>}
                        {j.error && <div style={{ fontSize: 12, color: j.status === "failed" ? "var(--bad)" : "var(--muted)", marginTop: 4 }}>{j.error}</div>}
                      </div>
                      <JobActions jobId={j.id} status={j.status} auto={auto} />
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </>
  );
}
