"use client";

import { useState } from "react";

/** 复制富文本（带格式的 HTML），粘进公众号编辑器保留排版；不支持时退回纯文字 */
export function RichCopyButton({ html, text, label = "复制富文本" }: { html: string; text: string; label?: string }) {
  const [done, setDone] = useState<string | null>(null);
  return (
    <button
      type="button"
      className="btn sm primary"
      onClick={async () => {
        try {
          await navigator.clipboard.write([
            new ClipboardItem({ "text/html": new Blob([html], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) }),
          ]);
          setDone("已复制，去公众号后台粘贴");
        } catch {
          await navigator.clipboard.writeText(text);
          setDone("浏览器不支持富文本，已复制纯文字");
        }
        setTimeout(() => setDone(null), 2400);
      }}
    >
      {done ?? label}
    </button>
  );
}
