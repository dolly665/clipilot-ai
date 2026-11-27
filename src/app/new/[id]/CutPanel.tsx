"use client";

import { useState, useTransition } from "react";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CUT_REASON_LABEL, cutStats, type CutReason } from "@/domain/roughcut";
import { formatTime } from "@/domain/transcript";
import { ROUGH_CUT_LEVELS, type RoughCutLevel } from "@/domain/types";
import type { RoughCutState } from "@/server/sources";
import { setCutLevel, toggleCut, type ActionResult } from "../../actions";

const REASON_TONE: Record<CutReason, string> = { pause: "", filler: "warn", repeat: "acc", retake: "bad" };

/** 粗剪面板：剪的力度、试听、每一刀单独恢复 */
export function CutPanel({ id, rc, duration }: { id: string; rc: RoughCutState; duration: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [showCuts, setShowCuts] = useState(false);
  const run = (fn: () => Promise<ActionResult>) => start(async () => setError((await fn()).error ?? null));
  const stats = cutStats(rc.cuts, rc.restored, duration);
  const rendering = rc.rendered?.version !== rc.version;
  const reasons = (Object.keys(stats.byReason) as CutReason[]).filter((r) => stats.byReason[r] > 0);

  return (
    <section className="panel">
      <AutoRefresh active={rendering} ms={1200} />
      <h2>
        去口误
        <small>{rendering ? <span className="chip acc">重新渲染试听中…</span> : <span className="chip ok">试听已更新</span>}</small>
      </h2>
      <div className="field">
        <span className="lbl">剪的力度</span>
        <div className="seg">
          {(Object.keys(ROUGH_CUT_LEVELS) as RoughCutLevel[]).map((l) => (
            <button key={l} type="button" className={rc.level === l ? "on" : ""} disabled={pending} onClick={() => run(() => setCutLevel(id, l))}>
              {ROUGH_CUT_LEVELS[l]}{l === "standard" && "（默认）"}
            </button>
          ))}
        </div>
        <span className="hint">换档会重新检测，之前单独恢复的刀会清空。</span>
      </div>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 12 }}>
        <div className="stat"><span className="v">{formatTime(duration)}</span><span className="l">原长</span></div>
        <div className="stat"><span className="v">{formatTime(duration - stats.removed)}</span><span className="l">剪后</span></div>
        <div className="stat"><span className="v">{stats.count}</span><span className="l">处剪掉</span></div>
      </div>
      <div className="chips" style={{ marginBottom: 12 }}>
        {reasons.map((r) => <span key={r} className={`chip ${REASON_TONE[r]}`}>{CUT_REASON_LABEL[r]} {stats.byReason[r]}</span>)}
      </div>

      <div className="cuttrack" aria-hidden="true" style={{ marginBottom: 10 }}>
        {rc.cuts.filter((c) => !rc.restored.includes(c.id)).map((c) => (
          <i key={c.id} style={{ left: `${(c.start / duration) * 100}%`, width: `max(2px, ${((c.end - c.start) / duration) * 100}%)` }} />
        ))}
      </div>

      {rc.rendered && (
        <audio key={rc.rendered.version} controls preload="metadata" style={{ width: "100%" }} src={`/api/sources/${id}/preview?v=${rc.rendered.version}`} />
      )}

      <button type="button" className="btn ghost sm" style={{ paddingLeft: 0, marginTop: 8 }} onClick={() => setShowCuts((x) => !x)}>
        {showCuts ? "收起" : `查看每一刀（${rc.cuts.length}）`}
      </button>
      {showCuts && (
        <div className="row-list" style={{ maxHeight: 360, overflowY: "auto" }}>
          {rc.cuts.map((c) => {
            const restored = rc.restored.includes(c.id);
            return (
              <div key={c.id} style={{ opacity: restored ? 0.55 : 1 }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--muted)", width: 48 }}>{formatTime(c.start)}</span>
                <div className="t">
                  <b style={{ textDecoration: restored ? "none" : "line-through" }}>{c.text ?? `${(c.end - c.start).toFixed(1)} 秒空白`}</b>
                  <span><span className={`chip ${REASON_TONE[c.reason]}`}>{CUT_REASON_LABEL[c.reason]}</span> {(c.end - c.start).toFixed(1)} 秒</span>
                </div>
                <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => toggleCut(id, c.id))}>{restored ? "剪掉" : "恢复"}</button>
              </div>
            );
          })}
        </div>
      )}
      {error && <p style={{ color: "var(--bad)", margin: "8px 0 0" }}>{error}</p>}
    </section>
  );
}
