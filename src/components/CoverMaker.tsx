"use client";

import { useEffect, useRef, useState } from "react";

const SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
const NO_LINE_START = "，。！？、；：）」』》”’…—,.!?;:)";

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of [...text]) {
    if (ctx.measureText(line + ch).width > maxWidth && line && !NO_LINE_START.includes(ch)) {
      lines.push(line);
      line = ch;
    } else line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

/** 在选中的帧上叠标题：底部渐暗 + 白色粗体大字，按画幅调整字号 */
function draw(canvas: HTMLCanvasElement, img: HTMLImageElement, title: string, orient: "h" | "v") {
  const W = img.naturalWidth;
  const H = img.naturalHeight;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, W, H);
  if (!title.trim()) return;
  const size = Math.round((orient === "v" ? W * 0.1 : H * 0.11));
  ctx.font = `800 ${size}px ${SANS}`;
  const pad = Math.round(W * 0.07);
  const lines = wrap(ctx, title.trim(), W - pad * 2);
  const lineH = size * 1.28;
  const block = lines.length * lineH;
  const bottom = orient === "v" ? H * 0.72 : H - pad * 0.9;
  const g = ctx.createLinearGradient(0, bottom - block - size * 1.5, 0, Math.min(H, bottom + size));
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.62)");
  ctx.fillStyle = g;
  ctx.fillRect(0, bottom - block - size * 1.5, W, H - (bottom - block - size * 1.5));
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "alphabetic";
  ctx.shadowColor = "rgba(0,0,0,0.5)";
  ctx.shadowBlur = size * 0.15;
  lines.forEach((l, i) => ctx.fillText(l, pad, bottom - block + (i + 1) * lineH - lineH * 0.22));
}

/** 封面：从成片里抽的几帧里挑一张，叠上标题，下载 PNG */
export function CoverMaker({ derivativeId, frames, title: initial, orient, name }: { derivativeId: string; frames: number; title: string; orient: "h" | "v"; name: string }) {
  const [pick, setPick] = useState(0);
  const [title, setTitle] = useState(initial);
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const img = new Image();
    img.onload = () => canvas.current && draw(canvas.current, img, title, orient);
    img.src = `/api/derivatives/${derivativeId}/frame/${pick}`;
  }, [derivativeId, pick, title, orient]);

  const download = () => {
    canvas.current?.toBlob((b) => {
      if (!b) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = `${name}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    }, "image/png");
  };

  return (
    <div className="grid" style={{ gap: 10 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {Array.from({ length: frames }, (_, i) => (
          <button key={i} type="button" onClick={() => setPick(i)} style={{ padding: 0, border: `2px solid ${pick === i ? "var(--accent)" : "transparent"}`, borderRadius: 8, background: "none", cursor: "pointer" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/derivatives/${derivativeId}/frame/${i}`} alt={`第 ${i + 1} 帧`} style={{ display: "block", height: orient === "v" ? 120 : 68, borderRadius: 6 }} />
          </button>
        ))}
      </div>
      <input className="textin" aria-label="封面标题" value={title} onChange={(e) => setTitle(e.target.value)} />
      <canvas ref={canvas} style={{ width: "100%", maxWidth: orient === "v" ? 280 : 520, borderRadius: 8, border: "1px solid var(--line)" }} />
      <div><button type="button" className="btn sm" onClick={download}>下载封面</button></div>
    </div>
  );
}
