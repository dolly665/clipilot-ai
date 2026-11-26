import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 本机运行；媒体处理在服务端用 ffmpeg 子进程完成
  serverExternalPackages: ["better-sqlite3"],
};

export default nextConfig;
