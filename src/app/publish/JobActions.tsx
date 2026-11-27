"use client";

import { useActionState, useState, useTransition } from "react";
import { markPublished, publishNow, retryJob, type PublishActionResult } from "./actions";

export function JobActions({ jobId, status, auto }: { jobId: string; status: string; auto: boolean }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<PublishActionResult>({});
  const [manual, setManual] = useState(false);
  const [formState, formAction, formPending] = useActionState(markPublished, {});
  const run = (fn: (id: string) => Promise<PublishActionResult>) => start(async () => setResult(await fn(jobId)));
  const canManual = ["approved", "failed", "awaiting_click"].includes(status);
  const shown = formState.error || formState.ok ? formState : result;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
        {status === "approved" && auto && <button className="btn primary" disabled={pending} onClick={() => run(publishNow)}>{pending ? "发布中…" : "立即发布"}</button>}
        {status === "failed" && <button className="btn" disabled={pending} onClick={() => run(retryJob)}>重试</button>}
        {canManual && !manual && <button className="btn" onClick={() => setManual(true)}>我已手动发布</button>}
      </div>
      {manual && (
        <form action={formAction} style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <input type="hidden" name="jobId" value={jobId} />
          <input name="url" id={`url-${jobId}`} placeholder="发布后的链接（可不填）" style={{ minWidth: 0, width: 220 }} />
          <button className="btn primary" disabled={formPending}>确认</button>
          <button type="button" className="btn" onClick={() => setManual(false)}>取消</button>
        </form>
      )}
      {shown.error && <span style={{ fontSize: 12, color: "var(--bad)" }}>{shown.error}</span>}
      {shown.ok && <span style={{ fontSize: 12, color: "var(--ok)" }}>{shown.ok}</span>}
    </div>
  );
}
