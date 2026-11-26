"use client";

import { useActionState, useState } from "react";
import { uploadText, type ActionResult } from "../actions";

export function UploadForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(uploadText, {});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);

  return (
    <form action={action}>
      <label
        className="drop"
        style={{ marginBottom: 14, cursor: "pointer", borderColor: dragOver ? "var(--accent)" : undefined }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const f = e.dataTransfer.files[0];
          const input = e.currentTarget.querySelector("input[type=file]") as HTMLInputElement | null;
          if (f && input) {
            const dt = new DataTransfer();
            dt.items.add(f);
            input.files = dt.files;
            setFileName(f.name);
          }
        }}
      >
        <div className="thumb">{fileName ? "已选择" : "拖到这里"}</div>
        <div style={{ minWidth: 0 }}>
          <b style={{ wordBreak: "break-all" }}>{fileName || "拖入文件，或点这里选择"}</b>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>现在支持长文本（.txt / .md）。音频、视频即将接入。</div>
        </div>
        <input
          type="file"
          name="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown"
          hidden
          onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
        />
      </label>

      <div className="field">
        <label htmlFor="text">或者直接粘贴长文</label>
        <textarea
          id="text"
          name="text"
          className="textin"
          rows={10}
          placeholder="原文不会被改动，清清只排版、加小标题和金句。"
          style={{ fontSize: 14, lineHeight: 1.7, resize: "vertical" }}
        />
      </div>

      {state.error && <div className="notice bad" style={{ marginBottom: 14 }}><span>!</span><div><b>{state.error}</b></div></div>}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button className="btn primary" disabled={pending}>{pending ? "上传中…" : "交给清清"}</button>
      </div>
    </form>
  );
}
