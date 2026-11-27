import { PageHead } from "@/components/PageHead";
import { Chip } from "@/components/ui";
import { METHOD_LABEL, PLATFORM_KEYS, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { TOPICS } from "@/domain/types";
import { prisma } from "@/server/app";
import { removeWord } from "./actions";
import { WordForm } from "./WordForm";

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

export default async function SettingsPage() {
  const words = await prisma.sensitiveWord.findMany({ orderBy: { createdAt: "asc" } });
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
            <div><div className="t"><b>音频</b><span>小宇宙、喜马拉雅 + 公众号长文</span></div></div>
            <div><div className="t"><b>长文本</b><span>公众号、知乎 + 公众号贴图、小红书图文、微博、YouTube 社区帖</span></div></div>
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>这里是默认勾选，每条内容在发布信息页都能改。</p>
        </section>
      </div>
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
