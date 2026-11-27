import { CancelSourceButton } from "@/components/CancelSourceButton";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { ApproveButton } from "@/components/ApproveButton";
import { CardDeck } from "@/components/CardDeck";
import { CoverMaker } from "@/components/CoverMaker";
import { WechatCopy } from "@/components/WechatCopy";
import { AutoRefresh } from "@/components/AutoRefresh";
import { CopyButton } from "@/components/CopyButton";
import { RegenerateButton } from "@/components/RegenerateButton";
import { Chip, Highlighted, JobChip, Notice, RegionChips, SourceStatusChip } from "@/components/ui";
import { scanSensitive } from "@/domain/compliance";
import { derivativeCopyText, type DerivativeContent } from "@/domain/derivatives";
import type { Article } from "@/domain/longform";
import { isPlatformKey, METHOD_LABEL, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { formatTime } from "@/domain/transcript";
import { CONTENT_TYPES, ROUGH_CUT_LEVELS } from "@/domain/types";
import { prisma } from "@/server/app";
import { accountName } from "@/domain/brand";
import { cutStats } from "@/domain/roughcut";
import { defaultScheduleTime, readDraft, readHits, readRoughCut } from "@/server/sources";

type Tab = "video" | "copy" | "podcast" | "article" | "zhihu" | "posts" | "manuscript" | "original";
const TEXT_TABS: [Tab, string][] = [["article", "公众号长文"], ["zhihu", "知乎"], ["posts", "短帖"], ["manuscript", "底稿"], ["original", "原文"]];
const AUDIO_TABS: [Tab, string][] = [["podcast", "播客"], ["article", "公众号长文"], ["zhihu", "知乎"], ["original", "转录稿"]];
const VIDEO_TABS: [Tab, string][] = [["video", "成片与封面"], ["copy", "各平台文案"], ["podcast", "播客"], ["article", "公众号长文"], ["zhihu", "知乎"], ["original", "转录稿"]];
const GEN_STAGE: Record<string, string> = { render_video: "正在剪成片…", burn_subtitles: "正在把字幕烧进画面…", cover: "正在挑封面帧…", copy: "正在写各平台文案…" };
/** 视频的这几个标签只在有对应成品时显示（竖屏不出播客和长文） */
const VIDEO_TAB_KIND: Partial<Record<Tab, string>> = { podcast: "podcast", article: "longform", zhihu: "zhihu_article" };

export default async function SourceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const s = await prisma.source.findUnique({
    where: { id },
    include: { derivatives: { orderBy: { createdAt: "asc" } }, jobs: true },
  });
  if (!s) notFound();
  const isAudio = s.kind === "audio" || s.kind === "video";
  const TABS = s.kind === "video"
    ? VIDEO_TABS.filter(([k]) => !VIDEO_TAB_KIND[k] || s.derivatives.length === 0 || s.derivatives.some((d) => d.kind === VIDEO_TAB_KIND[k]))
    : s.kind === "audio"
      ? [...(s.derivatives.some((d) => d.kind === "video") ? VIDEO_TABS.slice(0, 2) : []), ...AUDIO_TABS]
      : TEXT_TABS;
  const tab: Tab = TABS.find(([k]) => k === sp.tab)?.[0] ?? TABS[0]![0];
  const draft = readDraft(s);
  const words = (await prisma.sensitiveWord.findMany()).map((w) => w.word);
  const hl = (text: string) => <Highlighted text={text} hits={scanSensitive(text, words)} />;
  const editable = s.status === "review";

  const ders = s.derivatives.map((d) => ({ ...d, c: d.content as unknown as DerivativeContent }));
  const manuscript = s.kind === "text" ? await prisma.manuscript.findFirst({ where: { sourceId: id }, orderBy: { version: "desc" } }) : null;
  const derHitCount = ders.reduce((n, d) => n + readHits(d.hits).length, 0);
  const sourceHits = readHits(s.hits);
  const jobs = s.jobs.filter((j) => isPlatformKey(j.platform)).sort((a, b) => a.platform.localeCompare(b.platform));
  const reviewJobs = jobs.filter((j) => j.status === "pending_review").map((j) => j.platform as PlatformKey);
  const blocked = jobs.filter((j) => j.status === "compliance_blocked");

  const actions = (d: (typeof ders)[number]) => (
    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center", flexWrap: "wrap" }}>
      {editable && <RegenerateButton derivativeId={d.id} sourceId={id} />}
      <a className="btn sm" href={`/api/derivatives/${d.id}/download`}>下载</a>
      <CopyButton text={derivativeCopyText(d.c)} />
    </div>
  );
  const meta = (d: (typeof ders)[number]) => (
    <span style={{ fontSize: 12, color: "var(--muted)" }}>
      模板 {d.templateKey} v{d.templateVersion}
      {readHits(d.hits).length > 0 && <> · <span style={{ color: "var(--bad)" }}>{readHits(d.hits).length} 处敏感词</span></>}
    </span>
  );

  const article = (a: Article, title: string) => (
    <div className="article">
      <h3>{hl(title)}</h3>
      {a.lead && <p className="lead">{hl(a.lead)}</p>}
      {a.blocks.map((b, i) =>
        b.type === "heading" ? <h4 key={i}>{hl(b.text)}</h4> : b.type === "quote" ? <blockquote key={i}>{hl(b.text)}</blockquote> : <p key={i}>{hl(b.text)}</p>,
      )}
    </div>
  );

  let body: ReactNode = null;
  if (s.status === "generating") body = <section className="panel" style={{ textAlign: "center", padding: 40 }}><b>{GEN_STAGE[s.stage ?? ""] ?? "正在生成全部成品…"}</b><p style={{ color: "var(--muted)" }}>{s.kind === "video" ? "视频要重新编码，长视频可能要几分钟。" : ""}好了会自动刷新。</p></section>;
  else if (s.status === "failed") body = <Notice tone="bad" icon="!" title="生成失败">{s.error} <Link href={`/new/${id}`}>回到发布信息重试</Link></Notice>;
  else if (tab === "video") {
    const videos = ders.filter((d) => d.c.kind === "video");
    const sub = ders.find((d) => d.c.kind === "subtitle");
    const cover = ders.find((d) => d.c.kind === "cover");
    body = (
      <div className="grid" style={{ gap: 16 }}>
        {videos.map((d) => d.c.kind === "video" && (
          <div className="copycard" key={d.id}>
            <header>
              <b>{s.kind === "audio" ? "配画面的视频" : d.c.variant === "burned" ? "成片 · 字幕烧进画面" : "成片 · 无字幕"}</b>
              <span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{formatTime(d.c.durationSec)}</span>
            </header>
            <video controls preload="metadata" style={{ width: "100%", maxHeight: 480, background: "#000", borderRadius: 8 }} src={`/api/derivatives/${d.id}/file`} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>
                {s.kind === "audio" ? "照片 + 声波 + 字幕，B站、视频号、YouTube 都用这个" : d.c.variant === "burned" ? (d.c.orient === "v" ? "抖音、小红书、视频号、Shorts 用这个" : "视频号用这个") : d.c.orient === "h" ? "B站、YouTube 用这个，另外上传下面的字幕文件" : "原画面，备用"}
              </span>
              <a className="btn sm" href={`/api/derivatives/${d.id}/file?download=1`}>下载视频</a>
            </div>
          </div>
        ))}
        {sub?.c.kind === "subtitle" && (
          <div className="copycard">
            <header><b>字幕文件 SRT</b><span style={{ fontSize: 12, color: "var(--muted)" }}>{sub.c.cues} 条</span></header>
            <div style={{ display: "flex", justifyContent: "flex-end" }}><a className="btn sm" href={`/api/derivatives/${sub.id}/file?download=1`}>下载字幕</a></div>
          </div>
        )}
        {cover?.c.kind === "cover" && (
          <div className="copycard">
            <header><b>封面</b><span style={{ fontSize: 12, color: "var(--muted)" }}>选一帧、改标题，再下载</span></header>
            <CoverMaker derivativeId={cover.id} frames={cover.c.frames.length} title={cover.c.title} orient={cover.c.orient} name={`${draft.title}-封面`} />
          </div>
        )}
      </div>
    );
  } else if (tab === "copy") {
    body = (
      <div className="grid g2" style={{ gap: 10 }}>
        {ders.filter((d) => d.c.kind === "video_copy" && d.platform && isPlatformKey(d.platform)).map((d) => {
          const pk = d.platform as PlatformKey;
          const c = d.c as Extract<DerivativeContent, { kind: "video_copy" }>;
          return (
            <div className="copycard" key={d.id}>
              <header><b>{PLATFORMS[pk].name}</b><Chip tone={PLATFORMS[pk].region}>{PLATFORMS[pk].region === "cn" ? "国内" : "海外"}</Chip></header>
              <div className="cfield"><div className="lab"><span>标题</span><span className="mono">{[...c.title].length} 字</span></div><div className="val">{hl(c.title)}</div></div>
              {c.desc && <div className="cfield"><div className="lab"><span>简介</span></div><div className="val" style={{ whiteSpace: "pre-wrap" }}>{hl(c.desc)}</div></div>}
              {c.tags.length > 0 && <div className="cfield"><div className="lab"><span>标签</span></div><div className="val">{c.tags.map((t) => `#${t}`).join(" ")}</div></div>}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>{meta(d)}{actions(d)}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === "podcast") {
    const d = ders.find((x) => x.c.kind === "podcast");
    body = d?.c.kind === "podcast" && (
      <div className="grid" style={{ gap: 16 }}>
        <div className="copycard">
          <header><b>播客音频</b><span className="mono" style={{ fontSize: 12, color: "var(--muted)" }}>{formatTime(d.c.durationSec)}</span></header>
          <audio controls preload="metadata" style={{ width: "100%" }} src={`/api/derivatives/${d.id}/file`} />
          <div style={{ display: "flex", justifyContent: "flex-end" }}><a className="btn sm" href={`/api/derivatives/${d.id}/file?download=1`}>下载音频</a></div>
        </div>
        <div className="copycard">
          <header><b>节目说明</b><span style={{ fontSize: 12, color: "var(--muted)" }}>小宇宙、喜马拉雅共用</span></header>
          <div className="cfield"><div className="val">{hl(d.c.shownotes)}</div></div>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>{meta(d)}{actions(d)}</div>
        </div>
      </div>
    );
  } else if (tab === "article") {
    const d = ders.find((x) => x.c.kind === "longform");
    body = d?.c.kind === "longform" && (
      <div className="grid" style={{ gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {meta(d)}
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {actions(d)}
            <WechatCopy article={d.c.article} />
          </div>
        </div>
        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0 }}>标题「{d.c.article.title}」单独填进公众号的标题栏；「复制富文本」复制的是正文，按选的排版主题带好样式，粘进编辑器格式不乱。</p>
        {article(d.c.article, d.c.article.title)}
      </div>
    );
  } else if (tab === "zhihu") {
    const a = ders.find((x) => x.c.kind === "zhihu_article");
    const idea = ders.find((x) => x.c.kind === "zhihu_idea");
    body = (
      <div className="grid" style={{ gap: 16 }}>
        {idea?.c.kind === "zhihu_idea" && (
          <div className="copycard">
            <header><b>知乎想法</b><Chip tone="cn">国内</Chip></header>
            <div className="cfield"><div className="val">{hl(idea.c.text)}</div></div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>{meta(idea)}{actions(idea)}</div>
          </div>
        )}
        {a?.c.kind === "zhihu_article" && (
          <div className="grid" style={{ gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}><b>知乎文章 · 问题式标题</b>{actions(a)}</div>
            {article(a.c.article, a.c.question)}
          </div>
        )}
      </div>
    );
  } else if (tab === "posts") {
    body = (
      <div className="grid g2" style={{ gap: 10 }}>
        {ders.filter((d) => d.c.kind === "post" && d.platform && isPlatformKey(d.platform)).map((d) => {
          const pk = d.platform as PlatformKey;
          const c = d.c as Extract<DerivativeContent, { kind: "post" }>;
          return (
            <div className="copycard" key={d.id}>
              <header><b>{PLATFORMS[pk].name}</b><Chip tone={PLATFORMS[pk].region}>{PLATFORMS[pk].region === "cn" ? "国内" : "海外"}</Chip></header>
              {c.title && <div className="cfield"><div className="lab"><span>标题</span></div><div className="val">{hl(c.title)}</div></div>}
              <div className="cfield"><div className="lab"><span>正文</span><span className="mono">{[...c.text].length} 字</span></div><div className="val">{hl(c.text)}</div></div>
              {c.tags && c.tags.length > 0 && <div className="cfield"><div className="lab"><span>话题</span></div><div className="val">{c.tags.map((t) => `#${t}`).join(" ")}</div></div>}
              {(pk === "xhsn" || pk === "gzhp") && c.cover && c.cards && c.cards.length > 0 && (
                <div className="cfield">
                  <div className="lab"><span>图卡</span></div>
                  <CardDeck deck={{ cover: c.cover, cards: c.cards }} platform={pk} name={`${draft.title}-${PLATFORMS[pk].name}`} signature={accountName(PLATFORMS[pk].region)} />
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>{meta(d)}{actions(d)}</div>
            </div>
          );
        })}
      </div>
    );
  } else if (tab === "manuscript") {
    body = manuscript ? (
      <div className="grid" style={{ gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "var(--muted)" }}>v{manuscript.version} · {manuscript.origin === "user" ? "你改过" : manuscript.origin === "ai" ? "AI 润色" : "原文"} · {s.textMode === "polish" ? "录音转写，已理顺润色" : "写好的文章，原样保留"}</span>
          <CopyButton text={manuscript.body} />
        </div>
        <div className="article" style={{ whiteSpace: "pre-wrap" }}>{hl(manuscript.body)}</div>
      </div>
    ) : <p style={{ color: "var(--muted)" }}>这条内容没有底稿。</p>;
  } else {
    body = <div className="article" style={{ whiteSpace: "pre-wrap" }}>{hl(s.text ?? "")}</div>;
  }

  return (
    <>
      <AutoRefresh active={s.status === "generating"} />
      <div className="head">
        <div>
          <Link href="/library" className="btn ghost sm" style={{ paddingLeft: 0 }}>← 内容库</Link>
          <h1 style={{ marginTop: 4 }}>{draft.title || s.originalName}</h1>
          <p>{CONTENT_TYPES[draft.type]} · {draft.topic} · {s.createdAt.toLocaleDateString("zh-CN")}</p>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
          <div className="chips"><RegionChips regions={draft.regions} /><SourceStatusChip status={s.status} /></div>
          {s.status !== "approved" && <CancelSourceButton id={id} label="删除这条" />}
        </div>
      </div>
      <div className="grid g-detail">
        <aside style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <section className="panel">
            <dl className="kv" style={{ marginTop: 0 }}>
              <dt>源文件</dt><dd className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{s.originalName}</dd>
              <dt>Source</dt><dd className="mono" style={{ fontSize: 12, wordBreak: "break-all" }}>{s.id}</dd>
              <dt>大小</dt><dd>{s.sizeBytes > 1024 * 1024 ? `${(s.sizeBytes / 1024 / 1024).toFixed(1)} MB` : `${(s.sizeBytes / 1024).toFixed(1)} KB`}{isAudio && s.durationSec ? ` · ${formatTime(s.durationSec)}` : ` · ${[...(s.text ?? "")].length} 字`}</dd>
              {(() => {
                const rc = readRoughCut(s);
                if (!rc || !s.durationSec) return null;
                const st = cutStats(rc.cuts, rc.restored, s.durationSec);
                return <><dt>粗剪</dt><dd>{ROUGH_CUT_LEVELS[rc.level]} · 删 {st.count} 处，共 {formatTime(st.removed)}</dd></>;
              })()}
              <dt>成品</dt><dd>{ders.length} 件</dd>
            </dl>
          </section>
          <section className="panel">
            <h2>发布去向</h2>
            {jobs.length === 0 ? <p style={{ color: "var(--muted)", margin: 0 }}>生成后出现。</p> : (
              <div className="row-list">
                {jobs.map((j) => {
                  const pk = j.platform as PlatformKey;
                  return (
                    <div key={j.id}>
                      <div className="t"><b>{PLATFORMS[pk].name}</b><span>{j.status === "compliance_blocked" ? (j.blockReason === "topic" ? "主题只发海外" : "有敏感词") : j.scheduledAt ? `排期 ${j.scheduledAt.toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}` : METHOD_LABEL[PLATFORMS[pk].method]}</span></div>
                      <JobChip status={j.status} />
                    </div>
                  );
                })}
              </div>
            )}
          </section>
          <section className="panel">
            <h2>国内合规</h2>
            {blocked.length > 0 ? (
              <Notice tone="bad" icon="⛔" title={`已拦截国内 ${blocked.length} 个平台`}>
                {blocked.some((j) => j.blockReason === "topic") && `主题「${draft.topic}」只发海外。`}
                {sourceHits.length > 0 && `${isAudio ? "转录稿" : "底稿"}里有：${[...new Set(sourceHits.map((h) => h.word))].join("、")}。`}
                {derHitCount > 0 && `生成的文字里有 ${derHitCount} 处敏感词，已在各标签页标出。`}
              </Notice>
            ) : draft.regions.includes("cn") ? (
              <Notice tone="ok" icon="✓" title="通过">原文和生成的文字都没有发现敏感词。</Notice>
            ) : (
              <Notice tone="warn" icon="—" title="仅海外，未发国内" />
            )}
          </section>
        </aside>
        <section style={{ minWidth: 0 }}>
          <div className="tabs">
            {TABS.map(([k, label]) => (
              <Link key={k} href={`?tab=${k}`} scroll={false} className={tab === k ? "on" : ""}>{label}</Link>
            ))}
          </div>
          {body}
        </section>
      </div>
      {reviewJobs.length > 0 && (
        <div className="approvebar">
          <div>
            <b>批准后发布到 {reviewJobs.length} 个平台</b>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>{reviewJobs.map((k) => PLATFORMS[k].name).join("、")}</div>
          </div>
          <ApproveButton id={id} title={draft.title} platforms={reviewJobs} defaultAt={defaultScheduleTime().toISOString()} />
        </div>
      )}
    </>
  );
}
