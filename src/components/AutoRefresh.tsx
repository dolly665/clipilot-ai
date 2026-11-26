"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** 后台任务进行中时定时刷新页面数据 */
export function AutoRefresh({ active, ms = 1500 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
