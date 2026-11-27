"use client";

import { useActionState } from "react";
import { uploadAudioBackground, type FormResult } from "./actions";

/** 音频配画面的背景照片：预览 + 换一张 */
export function PhotoForm({ has, stamp }: { has: boolean; stamp: number }) {
  const [state, action, pending] = useActionState<FormResult, FormData>(uploadAudioBackground, {});
  return (
    <form action={action} className="grid" style={{ gap: 10 }}>
      {has ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/assets/audio-bg?t=${stamp}`} alt="背景照片" style={{ width: "100%", maxWidth: 360, aspectRatio: "16/9", objectFit: "cover", borderRadius: 8, filter: "brightness(.88)" }} />
      ) : (
        <div style={{ width: "100%", maxWidth: 360, aspectRatio: "16/9", borderRadius: 8, background: "#4A453D", color: "#F2EDE4", display: "grid", placeItems: "center", fontSize: 13 }}>还没传照片，先用纯色背景</div>
      )}
      <div className="inline">
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" aria-label="选择照片" />
        <button className="btn" disabled={pending}>{pending ? "上传中…" : has ? "换这张" : "用这张"}</button>
      </div>
      {state.error && <p style={{ fontSize: 12, color: "var(--bad)", margin: 0 }}>{state.error}</p>}
      {state.ok && <p style={{ fontSize: 12, color: "var(--ok)", margin: 0 }}>{state.ok}</p>}
    </form>
  );
}
