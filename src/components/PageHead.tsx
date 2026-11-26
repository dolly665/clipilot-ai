import type { ReactNode } from "react";

export function PageHead({ title, desc, eyebrow, actions }: { title: string; desc?: ReactNode; eyebrow?: string; actions?: ReactNode }) {
  return (
    <div className="head">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {desc && <p>{desc}</p>}
      </div>
      {actions}
    </div>
  );
}
