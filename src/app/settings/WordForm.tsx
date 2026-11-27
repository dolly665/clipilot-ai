"use client";

import { useActionState, useEffect, useRef } from "react";
import { addWord, type FormResult } from "./actions";

export function WordForm() {
  const [state, action, pending] = useActionState<FormResult, FormData>(addWord, {});
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state.ok && input.current) input.current.value = "";
  }, [state]);
  return (
    <form action={action}>
      <div className="inline">
        <input ref={input} name="word" placeholder="加一个词，比如：因果" aria-label="新增敏感词" />
        <button className="btn" disabled={pending}>添加</button>
      </div>
      {state.error && <p style={{ fontSize: 12, color: "var(--bad)", margin: "6px 0 0" }}>{state.error}</p>}
      {state.ok && <p style={{ fontSize: 12, color: "var(--ok)", margin: "6px 0 0" }}>{state.ok}</p>}
    </form>
  );
}
