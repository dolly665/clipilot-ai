"use client";

import { useState, useTransition } from "react";
import { cancelSource } from "@/app/actions";

/** 取消这条内容（处理中、底稿、发布信息、审核阶段都能用） */
export function CancelSourceButton({ id, label = "取消这条" }: { id: string; label?: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
      <button
        type="button"
        className="btn sm"
        disabled={pending}
        onClick={() => {
          if (!confirm("取消这条内容？上传的文件、底稿和已生成的成品都会删掉，不能恢复。")) return;
          setError(null);
          start(async () => {
            const r = await cancelSource(id);
            if (r?.error) setError(r.error);
          });
        }}
      >
        {pending ? "取消中…" : label}
      </button>
      {error && <span style={{ fontSize: 12, color: "var(--bad)" }}>{error}</span>}
    </div>
  );
}
