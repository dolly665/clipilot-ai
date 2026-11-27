import fs from "node:fs/promises";
import type { PrismaClient } from "@/generated/prisma/client";
import type { DerivativeContent } from "@/domain/derivatives";
import { dataDir } from "../env";
import { resolveData } from "../storage";
import { deleteCredential, readCredential, writeCredential } from "./credentials";
import type { PublishConnector } from "./types";

/**
 * YouTube 官方接口（Data API v3）：OAuth 授权、分块断点上传、上传中文字幕、设封面。
 * 不依赖 googleapis 包，直接调 HTTPS 接口。客户端 ID 和密钥从环境变量读。
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD = "https://www.googleapis.com/upload/youtube/v3";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];
/** 分块大小必须是 256KB 的整数倍；16MB 一块，断网时只重传这一块 */
const CHUNK = 16 * 1024 * 1024;

export type YoutubeConfig = { clientId: string; clientSecret: string; redirectUri: string };
type Stored = { refreshToken: string; channelId?: string; channelTitle?: string; connectedAt: string };

export function youtubeConfig(env: Record<string, string | undefined> = process.env): YoutubeConfig | null {
  const clientId = env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = env.YOUTUBE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) return null;
  const base = (env.APP_URL?.trim() || "http://localhost:3000").replace(/\/$/, "");
  return { clientId, clientSecret, redirectUri: `${base}/api/connect/youtube/callback` };
}

function requireConfig(): YoutubeConfig {
  const c = youtubeConfig();
  if (!c) throw new Error("还没配置 YouTube：在 .env 里填 YOUTUBE_CLIENT_ID 和 YOUTUBE_CLIENT_SECRET");
  return c;
}

/** 第一步：跳到 Google 授权页 */
export function youtubeAuthUrl(state: string, cfg = requireConfig()): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${q}`;
}

async function tokenRequest(body: Record<string, string>): Promise<{ access_token: string; refresh_token?: string }> {
  const res = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });
  const j = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !j.access_token) {
    if (j.error === "invalid_grant") throw new Error("YouTube 授权已失效，请在「平台与规则」里重新连接");
    throw new Error(`YouTube 授权失败：${j.error_description ?? j.error ?? res.status}`);
  }
  return { access_token: j.access_token, refresh_token: j.refresh_token };
}

/** 第二步：Google 回调带回 code，换成刷新令牌存起来，顺便记下频道名 */
export async function youtubeConnect(code: string, root = dataDir()) {
  const cfg = requireConfig();
  const t = await tokenRequest({ code, client_id: cfg.clientId, client_secret: cfg.clientSecret, redirect_uri: cfg.redirectUri, grant_type: "authorization_code" });
  if (!t.refresh_token) throw new Error("Google 没有给刷新令牌，请到 Google 账号的第三方应用里移除清清后重新连接");
  const ch = await api<{ items?: { id: string; snippet: { title: string } }[] }>("GET", `${API}/channels?part=snippet&mine=true`, t.access_token);
  const c = ch.items?.[0];
  const stored: Stored = { refreshToken: t.refresh_token, channelId: c?.id, channelTitle: c?.snippet.title, connectedAt: new Date().toISOString() };
  await writeCredential("youtube", stored, root);
  return stored;
}

export async function youtubeStatus(root = dataDir()): Promise<{ configured: boolean; connected: boolean; channelTitle?: string }> {
  const s = await readCredential<Stored>("youtube", root);
  return { configured: !!youtubeConfig(), connected: !!s, channelTitle: s?.channelTitle };
}

export async function youtubeDisconnect(root = dataDir()) {
  await deleteCredential("youtube", root);
}

async function accessToken(root: string): Promise<string> {
  const cfg = requireConfig();
  const s = await readCredential<Stored>("youtube", root);
  if (!s) throw new Error("还没连接 YouTube，请在「平台与规则」里点「连接 YouTube」");
  return (await tokenRequest({ refresh_token: s.refreshToken, client_id: cfg.clientId, client_secret: cfg.clientSecret, grant_type: "refresh_token" })).access_token;
}

async function api<T>(method: string, url: string, token: string, init: { body?: BodyInit; headers?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...init.headers }, body: init.body });
  const text = await res.text();
  if (!res.ok) throw new Error(`YouTube 接口错误 ${res.status}：${apiMessage(text)}`);
  return (text ? JSON.parse(text) : {}) as T;
}

function apiMessage(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: { message?: string; errors?: { reason?: string }[] } };
    const reason = j.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded") return "今天的接口额度用完了，明天再传（每天大约能传 6 条）";
    if (reason === "uploadLimitExceeded") return "频道今天的上传数量到上限了";
    return j.error?.message ?? text.slice(0, 300);
  } catch {
    return text.slice(0, 300);
  }
}

export type YoutubeUpload = {
  file: string;
  title: string;
  description: string;
  tags: string[];
  /** 定时公开；在未来时视频先私密，到点自动公开。不填或已过 = 立刻公开 */
  publishAt?: Date | null;
  categoryId?: string;
  srt?: string | null;
  thumbnail?: string | null;
};

/** YouTube 的限制：标题 ≤100 字符、不能有 < >；简介 ≤5000 字节；标签总长 ≤500 字符 */
export function youtubeSnippet(u: Pick<YoutubeUpload, "title" | "description" | "tags" | "categoryId">) {
  const clean = (s: string) => s.replace(/[<>]/g, "");
  let tags: string[] = [];
  let total = 0;
  for (const t of u.tags.map((x) => clean(x).trim()).filter(Boolean)) {
    const len = t.length + (t.includes(" ") ? 2 : 0) + (tags.length ? 1 : 0);
    if (total + len > 500) break;
    tags = [...tags, t];
    total += len;
  }
  let description = clean(u.description);
  while (Buffer.byteLength(description) > 5000) description = description.slice(0, -10);
  return {
    title: [...clean(u.title)].slice(0, 100).join("") || "无题",
    description,
    tags,
    categoryId: u.categoryId ?? process.env.YOUTUBE_CATEGORY_ID ?? "27",
    defaultLanguage: "zh-Hans",
    defaultAudioLanguage: "zh-Hans",
  };
}

/** 上传一条视频（分块、每块失败重试 3 次），再传字幕和封面。字幕、封面失败只记提醒，不算整条失败。 */
export async function youtubeUpload(u: YoutubeUpload, root = dataDir()): Promise<{ videoId: string; warnings: string[] }> {
  const token = await accessToken(root);
  const size = (await fs.stat(u.file)).size;
  const future = u.publishAt && u.publishAt.getTime() > Date.now() + 60_000;
  const meta = {
    snippet: youtubeSnippet(u),
    status: { privacyStatus: future ? "private" : "public", ...(future ? { publishAt: u.publishAt!.toISOString() } : {}), selfDeclaredMadeForKids: false },
  };
  const init = await fetch(`${UPLOAD}/videos?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": "video/*", "X-Upload-Content-Length": String(size) },
    body: JSON.stringify(meta),
  });
  const session = init.headers.get("location");
  if (!init.ok || !session) throw new Error(`YouTube 接口错误 ${init.status}：${apiMessage(await init.text())}`);

  const fh = await fs.open(u.file, "r");
  let videoId: string | undefined;
  try {
    let offset = 0;
    while (offset < size && !videoId) {
      const len = Math.min(CHUNK, size - offset);
      const buf = Buffer.alloc(len);
      await fh.read(buf, 0, len, offset);
      let res: Response | undefined;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          res = await fetch(session, { method: "PUT", headers: { "Content-Length": String(len), "Content-Range": `bytes ${offset}-${offset + len - 1}/${size}` }, body: buf });
          if (res.status < 500) break;
        } catch (e) {
          if (attempt === 2) throw new Error(`上传中断：${e instanceof Error ? e.message : e}`);
        }
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
      }
      if (!res) throw new Error("上传中断");
      if (res.status === 308) {
        const range = res.headers.get("range");
        offset = range ? Number(range.split("-")[1]) + 1 : offset + len;
      } else if (res.ok) {
        videoId = ((await res.json()) as { id: string }).id;
      } else {
        throw new Error(`YouTube 上传失败 ${res.status}：${apiMessage(await res.text())}`);
      }
    }
  } finally {
    await fh.close();
  }
  if (!videoId) throw new Error("YouTube 没有返回视频 ID");

  const warnings: string[] = [];
  if (u.srt) {
    try {
      const boundary = `qq${Date.now()}`;
      const snippet = JSON.stringify({ snippet: { videoId, language: "zh-Hans", name: "中文" } });
      const body = Buffer.concat([
        Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${snippet}\r\n--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
        await fs.readFile(u.srt),
        Buffer.from(`\r\n--${boundary}--`),
      ]);
      await api("POST", `${UPLOAD}/captions?uploadType=multipart&part=snippet`, token, { body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } });
    } catch (e) {
      warnings.push(`字幕没传上：${e instanceof Error ? e.message : e}。可以在 YouTube 工作室里手动上传 SRT`);
    }
  }
  if (u.thumbnail) {
    try {
      const img = await fs.readFile(u.thumbnail);
      if (img.length > 2 * 1024 * 1024) throw new Error("封面超过 2MB");
      await api("POST", `${UPLOAD}/thumbnails/set?videoId=${videoId}&uploadType=media`, token, { body: img, headers: { "Content-Type": /\.png$/i.test(u.thumbnail) ? "image/png" : "image/jpeg" } });
    } catch (e) {
      warnings.push(`封面没设上：${e instanceof Error ? e.message : e}。新频道要先在 YouTube 验证手机号才能自定义封面`);
    }
  }
  return { videoId, warnings };
}

/**
 * 发布一条已批准的 YouTube / Shorts 任务。只读发布任务和成品，不改任务状态（状态由发布执行器管）。
 * 用哪个成片：横屏 YouTube 用无字幕版 + 上传 SRT；Shorts 和音频配画面用字幕烧进画面的版本。
 */
export async function publishYoutubeJob(db: PrismaClient, jobId: string, opts: { root?: string } = {}) {
  const root = opts.root ?? dataDir();
  const job = await db.publishJob.findUniqueOrThrow({ where: { id: jobId }, include: { source: { include: { derivatives: true } } } });
  if (job.platform !== "yt" && job.platform !== "yts") throw new Error(`这条不是 YouTube 任务：${job.platform}`);
  if (job.status !== "approved" && job.status !== "queued" && job.status !== "uploading") throw new Error("只有已批准的任务可以发布");
  const ders = job.source.derivatives.map((d) => ({ ...d, c: d.content as unknown as DerivativeContent }));
  const copy = ders.find((d) => d.c.kind === "video_copy" && d.platform === job.platform);
  if (!copy || copy.c.kind !== "video_copy") throw new Error("没找到这个平台的标题和简介");
  const videos = ders.filter((d) => d.c.kind === "video" && d.filePath);
  const want = job.platform === "yt" ? "clean" : "burned";
  const video = videos.find((d) => d.c.kind === "video" && d.c.variant === want) ?? videos[0];
  if (!video?.filePath) throw new Error("没找到成片文件");
  const usesClean = video.c.kind === "video" && video.c.variant === "clean";
  const srt = usesClean ? ders.find((d) => d.c.kind === "subtitle")?.filePath : null;
  const cover = ders.find((d) => d.c.kind === "cover");
  const png = cover?.c.kind === "cover" ? cover.c.png : undefined;

  const isShort = job.platform === "yts";
  const title = isShort && !/#shorts/i.test(copy.c.title) ? `${copy.c.title} #Shorts` : copy.c.title;
  const description = [copy.c.desc, copy.c.tags.map((t) => `#${t.replace(/\s+/g, "")}`).join(" ")].filter(Boolean).join("\n\n");
  const r = await youtubeUpload(
    {
      file: resolveData(video.filePath, root),
      title,
      description,
      tags: copy.c.tags,
      publishAt: job.scheduledAt,
      srt: srt ? resolveData(srt, root) : null,
      thumbnail: png && !isShort ? resolveData(png, root) : null,
    },
    root,
  );
  const url = isShort ? `https://www.youtube.com/shorts/${r.videoId}` : `https://www.youtube.com/watch?v=${r.videoId}`;
  return { url, videoId: r.videoId, warnings: r.warnings };
}

/** 给发布执行器用：YouTube 和 Shorts 都是批准后马上上传，由 YouTube 按 publishAt 到点公开 */
export const youtubeConnectors: PublishConnector[] = (["yt", "yts"] as const).map((platform) => ({
  platform,
  uploadEarly: true,
  async publish(db, jobId) {
    const r = await publishYoutubeJob(db, jobId);
    return { url: r.url, warnings: r.warnings };
  },
}));
