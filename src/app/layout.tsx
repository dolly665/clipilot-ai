import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Nav } from "@/components/Nav";
import { prisma } from "@/server/app";
import "./globals.css";

export const metadata: Metadata = {
  title: "清清 · 时予清工作台",
  description: "时予清自媒体全平台一键发布工作台",
};

// 页面都读本机数据库，不做静态预渲染
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: ReactNode }) {
  const reviewCount = await prisma.source.count({ where: { status: "review" } });
  return (
    <html lang="zh-CN">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700&family=Noto+Serif+SC:wght@600;700&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body>
        <div className="app">
          <aside className="rail">
            <div className="brand">
              <b>清清</b>
              <span>时予清 · 发布工作台</span>
            </div>
            <Nav reviewCount={reviewCount} />
            <div className="rail-foot">本机运行 · 第一阶段<br />不会自动发布到任何平台</div>
          </aside>
          <main>{children}</main>
        </div>
      </body>
    </html>
  );
}
