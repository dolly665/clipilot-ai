"use client";

import { diffChars } from "diff";
import { useMemo, useState, useTransition } from "react";
import { Highlighted, Notice } from "@/components/ui";
import { charCount } from "@/domain/chunk";
import { scanSensitive } from "@/domain/compliance";
import { confirmManuscript, redraft, restoreManuscript, saveManuscript, type ActionResult } from "../../actions";

type Version = { version: number; origin: string; createdAt: string; chars: number };
type Props = {
  id: string;
  original: string;
  body: string;
  version: number;
  mode: "polish" | "layout";
  reason: string | null;
  modeEdited: boolean;
  warnings: string[];
  versions: Version[];
  words: string[];
};

const ORIGIN_LABEL: Record<string, string> = { ai: "AI 润色", original: "原文", user: "你改的" };

/** 改动对照：删掉的划线标红，新加的标绿 */
function DiffView({ from, to }: { from: string; to: string }) {
  const parts = useMemo(() => diffChars(from, to), [from, to]);
  return (
    <div className="manuscript-text">
      {parts.map((p, i) =>
        p.added ? <ins key={i}>{p.value}</ins> : p.removed ? <del key={i}>{p.value}</del> : <span key={i}>{p.value}</span>,
      )}
    </div>
  );
}

export function ManuscriptEditor(p: Props) {
  const [body, setBody] = useState(p.body);
  const [view, setView] = useState<"edit" | "diff">("edit");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const dirty = body.trim() !== p.body.trim();
  const run = (fn: () => Promise<ActionResult>) => start(async () => setError((await fn()).error ?? null));
  const hits = useMemo(() => scanSensitive(body, p.words), [body, p.words]);
  const hitWords = [...new Set(hits.map((h) => h.word))];
  const other = p.mode === "polish" ? "layout" : "polish";

  return (
    <div className="grid" style={{ gap: 16 }}>
      <section className="panel">
        <h2>
          <span>
            处理方式：{p.mode === "polish" ? "录音转写，理顺润色" : "写好的文章，原样保留只排版"}{" "}
            <span className={`chip ${p.modeEdited ? "warn" : "acc"}`}>{p.modeEdited ? "你改过" : "AI 判断"}</span>
          </span>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {p.mode === "polish" && (
              <button type="button" className="btn sm" disabled={pending} onClick={() => confirm("重新润色会生成一个新版本（旧版本还在）。继续？") && run(() => redraft(p.id, "polish"))}>
                重新润色
              </button>
            )}
            <button type="button" className="btn sm" disabled={pending} onClick={() => run(() => redraft(p.id, other))}>
              {other === "polish" ? "改成：需要润色" : "改成：原样保留"}
            </button>
          </span>
        </h2>
        {!p.modeEdited && p.reason && <span className="hint" style={{ fontSize: 12, color: "var(--muted)" }}>AI 判断：{p.reason}</span>}
        {p.warnings.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Notice tone="warn" icon="!" title="润色提醒">{p.warnings.join("；")}</Notice>
          </div>
        )}
        {hitWords.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Notice tone="bad" icon="⛔" title="底稿里有国内敏感词">{hitWords.join("、")}。不改的话国内平台会被拦截，只发海外。</Notice>
          </div>
        )}
      </section>

      <div className="grid g2" style={{ alignItems: "start" }}>
        <section className="panel">
          <h2>原文 <small>{charCount(p.original)} 字 · 不会被改动</small></h2>
          <div className="manuscript-text" style={{ color: "var(--muted)" }}>
            <Highlighted text={p.original} hits={scanSensitive(p.original, p.words)} />
          </div>
        </section>

        <section className="panel">
          <h2>
            <span>底稿 <small>v{p.version}{dirty && " · 有未保存的修改"} · {charCount(body)} 字</small></span>
            <span className="seg">
              <button type="button" className={view === "edit" ? "on" : ""} onClick={() => setView("edit")}>编辑</button>
              <button type="button" className={view === "diff" ? "on" : ""} onClick={() => setView("diff")}>看改动</button>
            </span>
          </h2>
          {view === "edit" ? (
            <textarea
              aria-label="底稿"
              className="textin manuscript-edit"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          ) : (
            <DiffView from={p.original} to={body} />
          )}
          {view === "diff" && <span className="hint" style={{ fontSize: 12, color: "var(--muted)" }}>红色划线是删掉的，绿色是新加的。</span>}
        </section>
      </div>

      <section className="panel">
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            历史版本
            <select
              className="textin"
              style={{ width: "auto", fontSize: 13, padding: "5px 8px" }}
              value=""
              disabled={pending}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (v && confirm(`回到 v${v}？会存成一个新版本，当前内容也还在历史里。`)) run(() => restoreManuscript(p.id, v));
              }}
            >
              <option value="">选一个版本恢复…</option>
              {p.versions.filter((v) => v.version !== p.version).map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version} · {ORIGIN_LABEL[v.origin] ?? v.origin} · {v.chars} 字 · {new Date(v.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                </option>
              ))}
            </select>
          </label>
          <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {error && <span style={{ color: "var(--bad)", alignSelf: "center" }}>{error}</span>}
            <button type="button" className="btn" disabled={pending || !dirty} onClick={() => run(() => saveManuscript(p.id, body))}>保存修改</button>
            <button type="button" className="btn primary" disabled={pending || !body.trim()} onClick={() => run(() => confirmManuscript(p.id, body))}>
              {pending ? "处理中…" : "确认底稿，下一步"}
            </button>
          </span>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>确认后清清用底稿判断主题、选平台，再生成各平台成品。底稿会存进底稿库。</p>
      </section>
    </div>
  );
}
