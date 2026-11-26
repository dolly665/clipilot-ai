import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHead } from "@/components/PageHead";
import { Notice } from "@/components/ui";
import { scanSensitive } from "@/domain/compliance";
import { availablePlatforms } from "@/domain/defaults";
import type { Orient, SourceKind } from "@/domain/types";
import { prisma } from "@/server/app";
import { readDraft, readHits, readPrefill, readStrings, sourceDecisions } from "@/server/sources";
import { retryPrefill } from "../../actions";
import { DraftForm } from "./DraftForm";

const STEPS = { text: ["读取文本", "国内合规检查", "判断主题，选平台和标题"] } as const;

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.source.findUnique({ where: { id } });
  if (!s) notFound();
  if (["generating", "review", "approved"].includes(s.status)) redirect(`/library/${id}`);

  const head = <PageHead eyebrow="第 1 步" title="上传新内容" desc={s.originalName} />;

  if (s.status === "processing" || (s.status === "failed" && !readPrefill(s))) {
    const failed = s.status === "failed";
    return (
      <>
        {head}
        <AutoRefresh active={!failed} />
        <section className="panel" style={{ maxWidth: 560 }}>
          <div className="row-list">
            {STEPS.text.map((step, k) => (
              <div key={step}>
                <span className={`dot ${failed ? "bad" : k === 0 ? "ok" : "acc"}`} />
                <div className="t"><b>{step}</b></div>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>{failed ? "" : k === 0 ? "完成" : "进行中…"}</span>
              </div>
            ))}
          </div>
          {failed && (
            <div style={{ marginTop: 14 }}>
              <Notice tone="bad" icon="!" title="预填失败">{s.error}</Notice>
              <form action={retryPrefill.bind(null, id)} style={{ marginTop: 12, textAlign: "right" }}>
                <button className="btn primary">重试</button>
              </form>
            </div>
          )}
        </section>
      </>
    );
  }

  const prefill = readPrefill(s)!;
  const draft = readDraft(s);
  const words = (await prisma.sensitiveWord.findMany()).map((w) => w.word);
  const hits = readHits(s.hits);
  const hitWords = [...new Set(hits.map((h) => h.word))];
  return (
    <>
      {head}
      <DraftForm
        id={id}
        draft={draft}
        titleAlts={[prefill.understand.title, ...readStrings(s.titleAlts)]}
        reasons={prefill.understand.reasons}
        edited={readStrings(s.edited)}
        hitWords={hitWords}
        available={availablePlatforms(s.kind as SourceKind, s.orient as Orient)}
        decisions={sourceDecisions(s)}
        failed={s.status === "failed" ? s.error : null}
        excerpt={(s.text ?? "").slice(0, 400)}
        excerptHits={scanSensitive((s.text ?? "").slice(0, 400), words)}
        size={s.sizeBytes}
      />
    </>
  );
}
