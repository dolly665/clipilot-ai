"use client";

import { useState, useTransition } from "react";
import { approve } from "@/app/actions";
import { METHOD_LABEL, PLATFORMS, type PlatformKey } from "@/domain/platforms";

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 一键批准：弹窗确认平台列表和发布时间（默认今晚 20:00） */
export function ApproveButton({ id, title, platforms, defaultAt }: { id: string; title: string; platforms: PlatformKey[]; defaultAt: string }) {
  const [open, setOpen] = useState(false);
  const [when, setWhen] = useState(toLocalInput(new Date(defaultAt)));
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <button className="btn primary" disabled={platforms.length === 0} onClick={() => setOpen(true)}>一键批准</button>
      {open && (
        <div className="scrim" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="approve-title">
            <h3 id="approve-title">批准「{title}」</h3>
            <p style={{ color: "var(--muted)", margin: "0 0 12px" }}>会生成 {platforms.length} 个发布任务：</p>
            <div className="row-list">
              {platforms.map((k) => (
                <div key={k}>
                  <div className="t"><b>{PLATFORMS[k].name}</b><span>{METHOD_LABEL[PLATFORMS[k].method]}</span></div>
                  <span className="chip warn">先复制 / 下载，手动发</span>
                </div>
              ))}
            </div>
            <div className="field" style={{ margin: "14px 0 0" }}>
              <label htmlFor="when">发布时间</label>
              <input id="when" type="datetime-local" className="textin" style={{ fontSize: 14 }} value={when} onChange={(e) => setWhen(e.target.value)} />
              <span className="hint">第一阶段还不会自动发布，这个时间记在发布任务上，提醒你什么时候发。</span>
            </div>
            {error && <p style={{ color: "var(--bad)" }}>{error}</p>}
            <div className="actions">
              <button className="btn" onClick={() => setOpen(false)}>再看看</button>
              <button
                className="btn primary"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await approve(id, new Date(when).toISOString());
                    if (r.error) setError(r.error);
                    else setOpen(false);
                  })
                }
              >
                {pending ? "处理中…" : "批准并排期"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
