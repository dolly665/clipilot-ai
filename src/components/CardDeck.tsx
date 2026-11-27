"use client";

import { useEffect, useRef, useState } from "react";

export type Deck = { cover: { title: string; subtitle: string }; cards: { title: string; body: string }[] };

const W = 1080;
const H = 1440;
const SERIF = '"Noto Serif SC","Songti SC","STSong",serif';
const SANS = '"Noto Sans SC","PingFang SC","Microsoft YaHei",sans-serif';
/** 行首不能出现的标点 */
const NO_LINE_START = "，。！？、；：）」』》”’…—,.!?;:)";

const THEMES = {
  xhsn: { bg: ["#FFF7EE", "#FCE9D6"], ink: "#2B1D12", accent: "#C2410C", soft: "#8A6A52" },
  gzhp: { bg: ["#F1F7F5", "#DCEBE6"], ink: "#16201D", accent: "#1D6B60", soft: "#5A6964" },
} as const;

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of [...para]) {
      if (ctx.measureText(line + ch).width > maxWidth && line && !NO_LINE_START.includes(ch)) {
        lines.push(line);
        line = ch;
      } else line += ch;
    }
    lines.push(line);
  }
  return lines;
}

function drawCard(canvas: HTMLCanvasElement, theme: (typeof THEMES)[keyof typeof THEMES], page: number, total: number, card: { title: string; body?: string; subtitle?: string }, isCover: boolean) {
  const ctx = canvas.getContext("2d")!;
  canvas.width = W;
  canvas.height = H;
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, theme.bg[0]);
  g.addColorStop(1, theme.bg[1]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const pad = 110;

  if (isCover) {
    ctx.fillStyle = theme.accent;
    ctx.fillRect(pad, 380, 90, 10);
    ctx.fillStyle = theme.ink;
    ctx.font = `700 108px ${SERIF}`;
    const lines = wrap(ctx, card.title, W - pad * 2);
    lines.forEach((l, i) => ctx.fillText(l, pad, 560 + i * 150));
    if (card.subtitle) {
      ctx.fillStyle = theme.soft;
      ctx.font = `400 48px ${SANS}`;
      wrap(ctx, card.subtitle, W - pad * 2).forEach((l, i) => ctx.fillText(l, pad, 560 + lines.length * 150 + 40 + i * 70));
    }
  } else {
    ctx.fillStyle = theme.accent;
    ctx.font = `500 40px ${SANS}`;
    ctx.fillText(String(page - 1).padStart(2, "0"), pad, 230); // 封面不算，内容卡从 01 开始
    ctx.fillStyle = theme.ink;
    ctx.font = `700 76px ${SERIF}`;
    const tl = wrap(ctx, card.title, W - pad * 2);
    tl.forEach((l, i) => ctx.fillText(l, pad, 360 + i * 104));
    let y = 360 + tl.length * 104 + 60;
    ctx.fillStyle = theme.accent;
    ctx.fillRect(pad, y - 30, 70, 6);
    ctx.fillStyle = theme.ink;
    ctx.font = `400 50px ${SANS}`;
    for (const l of wrap(ctx, card.body ?? "", W - pad * 2)) {
      y += 88;
      ctx.fillText(l, pad, y);
    }
  }
  ctx.fillStyle = theme.soft;
  ctx.font = `500 34px ${SANS}`;
  ctx.fillText("时予清", pad, H - 100);
  ctx.textAlign = "right";
  ctx.fillText(`${page} / ${total}`, W - pad, H - 100);
  ctx.textAlign = "left";
}

/** 3:4 图卡：在浏览器里画，用页面已加载的中文字体，可单张或全部下载 PNG */
export function CardDeck({ deck, platform, name }: { deck: Deck; platform: "xhsn" | "gzhp"; name: string }) {
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [ready, setReady] = useState(false);
  const pages = [{ ...deck.cover, isCover: true }, ...deck.cards.map((c) => ({ ...c, isCover: false }))];

  useEffect(() => {
    let cancelled = false;
    const allText = [deck.cover.title, deck.cover.subtitle, ...deck.cards.flatMap((c) => [c.title, c.body]), "时予清0123456789/"].join("");
    // 先按图卡上实际用到的字加载字体子集，否则画布会用后备字体
    Promise.all([
      document.fonts.load(`700 76px "Noto Serif SC"`, allText),
      document.fonts.load(`400 50px "Noto Sans SC"`, allText),
      document.fonts.load(`500 40px "Noto Sans SC"`, allText),
    ])
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return;
        pages.forEach((p, i) => {
          const c = refs.current[i];
          if (c) drawCard(c, THEMES[platform], i + 1, pages.length, p, p.isCover);
        });
        setReady(true);
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(deck), platform]);

  const download = (i: number) =>
    new Promise<void>((resolve) => {
      refs.current[i]?.toBlob((blob) => {
        if (!blob) return resolve();
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `${name}-${String(i + 1).padStart(2, "0")}.png`;
        a.click();
        setTimeout(() => { URL.revokeObjectURL(a.href); resolve(); }, 300);
      }, "image/png");
    });

  return (
    <div className="grid" style={{ gap: 10 }}>
      <div className="card-deck">
        {pages.map((p, i) => (
          <button key={i} type="button" className="card-thumb" title="下载这张" onClick={() => download(i)}>
            <canvas ref={(el) => { refs.current[i] = el; }} width={W} height={H} />
          </button>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>{pages.length} 张 · 1080×1440 · 点单张下载</span>
        <button type="button" className="btn sm" disabled={!ready} onClick={async () => { for (let i = 0; i < pages.length; i++) await download(i); }}>
          全部下载
        </button>
      </div>
    </div>
  );
}
