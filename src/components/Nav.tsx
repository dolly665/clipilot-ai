"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isActive } from "./nav-items";

export function Nav({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  return (
    <nav className="nav">
      {NAV_ITEMS.map((item) => {
        const count = item.href === "/review" ? reviewCount : 0;
        return (
          <Link key={item.href} href={item.href} className={isActive(item, pathname) ? "on" : undefined}>
            <span>{item.label}</span>
            {count > 0 && <span className="count">{count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
