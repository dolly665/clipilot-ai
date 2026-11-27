import { PageHead } from "@/components/PageHead";
import { Chip } from "@/components/ui";
import { METHOD_LABEL, PLATFORM_KEYS, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { TOPICS } from "@/domain/types";
import { prisma } from "@/server/app";
import { disconnectYoutube, removeWord } from "./actions";
import { youtubeConfig, youtubeStatus } from "@/server/publish/youtube";
import { Notice } from "@/components/ui";
import { WordForm } from "./WordForm";
import { PhotoForm } from "./PhotoForm";
import { audioBackground } from "@/server/storage";
import fs from "node:fs";

export const dynamic = "force-dynamic";

/** 每个平台现在怎么发（自动发布在第二、三阶段接入，之前都是清清备好文案和文件、你手动发） */
const NOW: Partial<Record<PlatformKey, string>> = {
  gzh: "现在：复制富文本粘进公众号后台。草稿箱接口要先确认个人订阅号有没有权限",
  gzhp: "现在：复制文字、下载图卡后手动发",
  xyz: "现在：下载播客音频手动上传。以后由清清生成 RSS，平台订阅",
  xmly: "现在：下载播客音频手动上传。以后由清清生成 RSS，平台订阅",
  yt: "现在：下载成片和字幕手动上传。第二阶段接官方接口，全自动",
  yts: "现在：下载成片手动上传。第二阶段接官方接口，全自动",
};

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ youtube?: string }> }) {
  const sp = await searchParams;
  const yt = await youtubeStatus();
  const redirectUri = youtubeConfig()?.redirectUri ?? "http://localhost:3000/api/connect/youtube/callback";
  const words = await prisma.sensitiveWord.findMany({ orderBy: { createdAt: "asc" } });
  const bg = await audioBackground();
  const bgStamp = bg ? Math.floor(fs.statSync(bg).mtimeMs) : 0;
  return (
    <>
      <PageHead title="平台与规则" desc="每个平台怎么发，以及国内合规词库。" />
      <div className="grid g2" style={{ marginBottom: 16 }}>
        <section className="panel">
          <h2>国内合规词库 <small>{words.length} 个词 · 命中就不发国内</small></h2>
          <div className="wordchips">
            {words.map((w) => (
              <span key={w.id} className="chip bad">
                {w.word}
                <form action={removeWord.bind(null, w.id)} style={{ display: "inline" }}>
                  <button aria-label={`删除 ${w.word}`}>×</button>
                </form>
              </span>
            ))}
          </div>
          <WordForm />
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
            改了词库，对之后新传的内容和重新生成的成品生效；已经生成好的不会自动重查。另外两条规则：主题选了「{TOPICS.filter((t) => t.region === "os").map((t) => t.name).join("」「")}」直接只发海外；生成后的长文和文案会再查一遍。
          </p>
        </section>
        <section className="panel">
          <h2>自动选平台的规则</h2>
          <div className="row-list" style={{ fontSize: 13 }}>
            <div><div className="t"><b>横屏视频</b><span>B站、视频号、YouTube + 公众号、小宇宙、喜马拉雅</span></div></div>
            <div><div className="t"><b>竖屏视频</b><span>抖音、小红书、视频号、YouTube Shorts</span></div></div>
            <div><div className="t"><b>录屏教学</b><span>默认不发播客</span></div></div>
            <div><div className="t"><b>Vlog</b><span>只发视频</span></div></div>
            <div><div className="t"><b>音频</b><span>小宇宙、喜马拉雅 + 公众号长文 + 配画面发 B站、视频号、YouTube</span></div></div>
            <div><div className="t"><b>长文本</b><span>公众号、知乎 + 公众号贴图、小红书图文、微博、YouTube 社区帖</span></div></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>这里是默认勾选，每条内容在发布信息页都能改。</p>
        </section>
      </div>
      <section className="panel" style={{ marginBottom: 16 }} id="youtube">
        <h2>自动发布 · YouTube <small>官方接口，批准后自动上传成片、字幕、封面，到点公开</small></h2>
        {sp.youtube && (
          <div style={{ marginBottom: 12 }}>
            {sp.youtube === "ok" ? <Notice tone="ok" icon="✓" title="YouTube 已连接" /> : <Notice tone="bad" icon="!" title="没连上">{sp.youtube}</Notice>}
          </div>
        )}
        {yt.connected ? (
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span>已连接频道：<b>{yt.channelTitle ?? "（没读到频道名）"}</b></span>
            <form action={disconnectYoutube}><button className="btn sm">断开</button></form>
            {!yt.configured && <span style={{ fontSize: 12, color: "var(--bad)" }}>.env 里的 YOUTUBE_CLIENT_ID / SECRET 不见了，上传会失败</span>}
          </div>
        ) : yt.configured ? (
          <a className="btn primary" href="/api/connect/youtube/start">连接 YouTube</a>
        ) : (
          <div style={{ fontSize: 13 }}>
            <p style={{ margin: "0 0 8px" }}>要先在 Google 那边建一个「应用」，拿到两串钥匙填进 <code>.env</code>（只做一次）：</p>
            <ol style={{ margin: 0, paddingLeft: 22, lineHeight: 1.9, listStyle: "decimal" }}>
              <li>打开 console.cloud.google.com，新建一个项目（名字随便，比如「清清」）。</li>
              <li>「API 和服务 → 库」里搜 <b>YouTube Data API v3</b>，点启用。</li>
              <li>「OAuth 同意屏幕」：用户类型选「外部」，填应用名和你的邮箱；在「测试用户」里加上你自己的 Google 账号；最后点「发布应用」，不然授权 7 天就失效。</li>
              <li>「凭据 → 创建凭据 → OAuth 客户端 ID」，类型选「Web 应用」，已获授权的重定向 URI 填：<div className="url" style={{ margin: "4px 0" }}>{redirectUri}</div></li>
              <li>把客户端 ID 和密钥填进 <code>.env</code> 的 <code>YOUTUBE_CLIENT_ID</code>、<code>YOUTUBE_CLIENT_SECRET</code>，重启清清，这里就会出现「连接 YouTube」。</li>
            </ol>
          </div>
        )}
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>
          注意：Google 规定，没通过审核的个人应用传上去的视频会被锁成「私享」。要让视频按时公开，需要在 Google 那边提交一次 YouTube API 审核（免费，一般几周）；审核前清清照样能传，你到 YouTube 工作室里手动改成公开就行。
        </p>
      </section>
      <section className="panel" style={{ marginBottom: 16 }}>
        <h2>音频配画面 <small>音频勾了视频平台时，画面 = 这张照片 + 声波 + 大字幕</small></h2>
        <PhotoForm has={!!bg} stamp={bgStamp} />
        <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>建议横图，比如你的一张半身照或工作台。照片会裁成 16:9 并稍微压暗，让字幕看得清。</p>
      </section>
      <h2 style={{ fontSize: 15, margin: "8px 0 10px" }}>平台</h2>
      <div className="grid g3">
        {PLATFORM_KEYS.map((k) => {
          const p = PLATFORMS[k];
          return (
            <section key={k} className="panel acct">
              <header><b>{p.name}</b><Chip tone={p.region}>{p.region === "cn" ? "国内" : "海外"}</Chip></header>
              <p style={{ margin: 0 }}>{"tbd" in p && p.tbd ? "以后再定" : METHOD_LABEL[p.method]}</p>
              <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>
                {NOW[k] ?? ("tbd" in p && p.tbd ? "还没决定做不做" : "现在：清清备好文案和文件，你手动发。第三阶段接浏览器半自动，最后的「发布」由你点")}
              </p>
            </section>
          );
        })}
      </div>
    </>
  );
}
