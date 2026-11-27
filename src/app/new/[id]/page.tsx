import { notFound, redirect } from "next/navigation";
import { AutoRefresh } from "@/components/AutoRefresh";
import { PageHead } from "@/components/PageHead";
import { Notice } from "@/components/ui";
import { scanSensitive } from "@/domain/compliance";
import { availablePlatforms } from "@/domain/defaults";
import type { Orient, SourceKind } from "@/domain/types";
import { prisma } from "@/server/app";
import { readDraft, readHits, readPrefill, readRoughCut, readStrings, sourceDecisions } from "@/server/sources";
import { retryPrefill } from "../../actions";
import { CutPanel } from "./CutPanel";
import { DraftForm } from "./DraftForm";

/** 处理步骤：[显示文字, 对应的 stage] */
const STEPS: Record<string, [string, string][]> = {
  text: [["读取文本", "read"], ["国内合规检查，判断主题、选平台和标题", "prefill"]],
  audio: [
    ["抽出音轨", "extract"],
    ["语音识别（逐字时间戳）", "asr"],
    ["找出停顿、口头禅、重复和说错重来", "cut"],
    ["剪辑并生成试听", "render"],
    ["国内合规检查，判断主题、选平台和标题", "prefill"],
  ],
};

export default async function DraftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = await prisma.source.findUnique({ where: { id } });
  if (!s) notFound();
  if (["generating", "review", "approved"].includes(s.status)) redirect(`/library/${id}`);

  const head = <PageHead eyebrow="第 1 步" title="上传新内容" desc={s.originalName} />;

  if (s.status === "processing" || (s.status === "failed" && !readPrefill(s))) {
    const failed = s.status === "failed";
    const steps = STEPS[s.kind] ?? STEPS.text!;
    const current = Math.max(0, steps.findIndex(([, st]) => st === (s.stage ?? (s.kind === "text" ? "prefill" : "extract"))));
    return (
      <>
        {head}
        <AutoRefresh active={!failed} />
        <section className="panel" style={{ maxWidth: 560 }}>
          <div className="row-list">
            {steps.map(([label], k) => {
              const state = k < current ? "done" : k === current ? (failed ? "fail" : "now") : "todo";
              return (
                <div key={label}>
                  <span className={`dot ${state === "done" ? "ok" : state === "now" ? "acc" : state === "fail" ? "bad" : "idle"}`} />
                  <div className="t"><b style={{ fontWeight: state === "now" ? 700 : 400 }}>{label}</b></div>
                  <span style={{ fontSize: 12, color: "var(--muted)" }}>{state === "done" ? "完成" : state === "now" ? "进行中…" : state === "fail" ? "失败" : ""}</span>
                </div>
              );
            })}
          </div>
          {!failed && <p style={{ fontSize: 12, color: "var(--muted)", margin: "12px 0 0" }}>可以先去忙别的，好了这里会自动刷新。</p>}
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
  const rc = readRoughCut(s);
  return (
    <>
      {head}
      <DraftForm
        id={id}
        kind={s.kind === "audio" ? "audio" : "text"}
        mediaPanel={rc && s.durationSec ? <CutPanel id={id} rc={rc} duration={s.durationSec} /> : undefined}
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
