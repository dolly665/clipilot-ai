"use client";

import { useActionState, useState } from "react";
import { savePrompt, type FormResult } from "../settings/actions";

export function PromptEditor({ name, body, isLatest, vars }: { name: string; body: string; isLatest: boolean; vars: string[] }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(savePrompt.bind(null, name), {});
  const [text, setText] = useState(body);
  return (
    <form action={action}>
      <textarea className="code" name="body" spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} aria-label="提示词内容" />
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 6 }}>可用变量（生成时由清清填进去，只能用这些）</div>
          <div className="vars">{vars.map((v) => <code key={v}>{`{{${v}}}`}</code>)}</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {text !== body && <button type="button" className="btn sm" onClick={() => setText(body)}>撤销修改</button>}
          <button className="btn sm primary" disabled={pending || text === body}>{pending ? "保存中…" : "保存为新版本"}</button>
        </div>
      </div>
      {!isLatest && <p style={{ fontSize: 12, color: "var(--muted)", margin: "8px 0 0" }}>你在看旧版本。基于它改完保存，也会存成最新版本。</p>}
      {state.error && <p style={{ fontSize: 12, color: "var(--bad)", margin: "8px 0 0" }}>{state.error}</p>}
    </form>
  );
}
