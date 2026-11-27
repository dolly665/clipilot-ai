"use client";

import { useRouter } from "next/navigation";
import { useActionState, useRef, useState } from "react";
import { uploadText, type ActionResult } from "../actions";

const MEDIA = /\.(mp3|m4a|aac|wav|flac|ogg|opus|wma|mp4|mov|m4v|mkv|webm|avi)$/i;

/** 音视频走流式上传接口（文件可能很大），带进度；可以中途取消 */
function uploadMedia(file: File, onProgress: (p: number) => void, xhr: XMLHttpRequest): Promise<{ id?: string; error?: string; aborted?: boolean }> {
  return new Promise((resolve) => {
    xhr.open("POST", `/api/upload?name=${encodeURIComponent(file.name)}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      try {
        resolve(JSON.parse(xhr.responseText));
      } catch {
        resolve({ error: `上传失败（${xhr.status}）` });
      }
    };
    xhr.onerror = () => resolve({ error: "上传失败，网络错误" });
    xhr.onabort = () => resolve({ aborted: true });
    xhr.send(file);
  });
}

export function UploadForm() {
  const [state, action, pending] = useActionState<ActionResult, FormData>(uploadText, {});
  const [fileName, setFileName] = useState("");
  const [dragOver, setDragOver] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const router = useRouter();
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  return (
    <form
      action={action}
      onSubmit={async (e) => {
        const input = e.currentTarget.querySelector("input[type=file]") as HTMLInputElement | null;
        const file = input?.files?.[0];
        if (!file || !MEDIA.test(file.name)) return; // 文本走 server action
        e.preventDefault();
        setMediaError(null);
        setProgress(0);
        const xhr = new XMLHttpRequest();
        xhrRef.current = xhr;
        const r = await uploadMedia(file, setProgress, xhr);
        xhrRef.current = null;
        if (r.id) router.push(`/new/${r.id}`);
        else {
          setProgress(null);
          if (!r.aborted) setMediaError(r.error ?? "上传失败");
        }
      }}
    >
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
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            {progress !== null ? `上传中 ${Math.round(progress * 100)}%` : "视频（mp4、mov……）、音频（mp3、m4a、wav……）或长文本（.txt / .md）。原文件不压缩。"}
          </div>
        </div>
        <input
          type="file"
          name="file"
          accept=".txt,.md,.markdown,text/plain,text/markdown,audio/*,video/*,.mp3,.m4a,.wav,.flac,.aac,.ogg,.mp4,.mov,.m4v,.mkv,.webm"
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

      {(mediaError ?? state.error) && <div className="notice bad" style={{ marginBottom: 14 }}><span>!</span><div><b>{mediaError ?? state.error}</b></div></div>}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
        {progress !== null && (
          <button type="button" className="btn" onClick={() => xhrRef.current?.abort()}>
            取消上传
          </button>
        )}
        <button className="btn primary" disabled={pending || progress !== null}>{pending || progress !== null ? "上传中…" : "交给清清"}</button>
      </div>
    </form>
  );
}
