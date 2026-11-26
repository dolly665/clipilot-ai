"use client";

import { useState, useTransition } from "react";
import { regenerate } from "@/app/actions";

export function RegenerateButton({ derivativeId, sourceId }: { derivativeId: string; sourceId: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      {error && <span style={{ fontSize: 12, color: "var(--bad)" }}>{error}</span>}
      <button
        className="btn sm"
        disabled={pending}
        onClick={() => start(async () => setError((await regenerate(derivativeId, sourceId)).error ?? null))}
      >
        {pending ? "生成中…" : "重新生成"}
      </button>
    </>
  );
}
