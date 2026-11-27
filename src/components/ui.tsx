import type { ReactNode } from "react";
import type { SensitiveHit } from "@/domain/compliance";
import { PUBLISH_STATUS, REGION_LABEL, type PublishStatus, type Region } from "@/domain/types";

export function Chip({ tone, children }: { tone?: "cn" | "os" | "ok" | "warn" | "bad" | "acc"; children: ReactNode }) {
  return <span className={`chip ${tone ?? ""}`}>{children}</span>;
}

export function RegionChips({ regions }: { regions: Region[] }) {
  return (
    <>
      {regions.map((r) => (
        <Chip key={r} tone={r}>{REGION_LABEL[r]}</Chip>
      ))}
    </>
  );
}

const JOB_TONE: Record<PublishStatus, "ok" | "warn" | "bad" | "acc"> = {
  pending_review: "warn",
  approved: "ok",
  queued: "acc",
  uploading: "acc",
  awaiting_click: "warn",
  published: "ok",
  failed: "bad",
  compliance_blocked: "bad",
};

export function JobChip({ status }: { status: string }) {
  const s = (status in PUBLISH_STATUS ? status : "pending_review") as PublishStatus;
  return <Chip tone={JOB_TONE[s]}>{PUBLISH_STATUS[s]}</Chip>;
}

const SOURCE_STATUS: Record<string, [string, "ok" | "warn" | "bad" | "acc"]> = {
  processing: ["处理中", "acc"],
  drafting: ["底稿待确认", "warn"],
  prefilled: ["待确认", "warn"],
  generating: ["生成中", "acc"],
  review: ["待审核", "warn"],
  approved: ["已批准", "ok"],
  failed: ["失败", "bad"],
};
export function SourceStatusChip({ status }: { status: string }) {
  const [label, tone] = SOURCE_STATUS[status] ?? [status, "acc"];
  return <Chip tone={tone}>{label}</Chip>;
}

/** 把敏感词命中位置标出来 */
export function Highlighted({ text, hits }: { text: string; hits: SensitiveHit[] }) {
  if (!hits.length) return <>{text}</>;
  const out: ReactNode[] = [];
  let at = 0;
  hits.forEach((h, i) => {
    if (h.start < at) return;
    out.push(text.slice(at, h.start));
    out.push(<mark key={i}>{text.slice(h.start, h.end)}</mark>);
    at = h.end;
  });
  out.push(text.slice(at));
  return <>{out}</>;
}

export function Notice({ tone, icon, title, children }: { tone: "ok" | "warn" | "bad"; icon: string; title: string; children?: ReactNode }) {
  return (
    <div className={`notice ${tone}`}>
      <span>{icon}</span>
      <div>
        <b>{title}</b>
        {children && <p>{children}</p>}
      </div>
    </div>
  );
}
