import Link from "next/link";
import { ApproveButton } from "@/components/ApproveButton";
import { PageHead } from "@/components/PageHead";
import { Chip, RegionChips } from "@/components/ui";
import { isPlatformKey, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { CONTENT_TYPES } from "@/domain/types";
import { prisma } from "@/server/app";
import { defaultScheduleTime, readDraft } from "@/server/sources";

export default async function ReviewPage() {
  const list = await prisma.source.findMany({ where: { status: "review" }, orderBy: { createdAt: "asc" }, include: { jobs: true, derivatives: { select: { id: true } } } });
  const defaultAt = defaultScheduleTime().toISOString();
  return (
    <>
      <PageHead title="审核" desc="所有生成好、等你过目的内容。逐条点开看，确认后一键批准。没有你的批准，任何内容都不会发布。" />
      {list.length === 0 ? (
        <section className="panel" style={{ textAlign: "center", padding: 40 }}>
          <b>都审完了</b>
          <p style={{ color: "var(--muted)" }}>新内容处理完会出现在这里。</p>
          <Link className="btn primary" href="/new">上传新内容</Link>
        </section>
      ) : (
        <div className="grid g2">
          {list.map((s) => {
            const d = readDraft(s);
            const jobs = s.jobs.filter((j) => isPlatformKey(j.platform));
            const pending = jobs.filter((j) => j.status === "pending_review").map((j) => j.platform as PlatformKey);
            const blocked = jobs.filter((j) => j.status === "compliance_blocked").map((j) => j.platform as PlatformKey);
            return (
              <section className="panel" key={s.id}>
                <div style={{ display: "flex", gap: 14 }}>
                  <div className="thumb">{s.derivatives.length} 件成品</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <b style={{ fontSize: 15 }}>{d.title}</b>
                    <div style={{ fontSize: 12, color: "var(--muted)", margin: "2px 0 8px" }}>{CONTENT_TYPES[d.type]} · {d.topic} · {s.createdAt.toLocaleDateString("zh-CN")}</div>
                    <RegionChips regions={d.regions} />
                  </div>
                </div>
                <div style={{ margin: "14px 0 6px", fontSize: 13 }}>将发布到 {pending.length} 个平台</div>
                <div className="chips">{pending.map((k) => <Chip key={k} tone={PLATFORMS[k].region}>{PLATFORMS[k].name}</Chip>)}</div>
                {blocked.length > 0 && <div style={{ marginTop: 8, fontSize: 12, color: "var(--bad)" }}>已拦截：{blocked.map((k) => PLATFORMS[k].name).join("、")}</div>}
                <div style={{ display: "flex", gap: 8, marginTop: 14, justifyContent: "flex-end" }}>
                  <Link className="btn" href={`/library/${s.id}`}>逐项查看</Link>
                  <ApproveButton id={s.id} title={d.title} platforms={pending} defaultAt={defaultAt} />
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
