"use client";

import { useState, useTransition } from "react";
import { Highlighted, Notice } from "@/components/ui";
import type { PlatformDecision, SensitiveHit } from "@/domain/compliance";
import { METHOD_LABEL, PLATFORMS, type PlatformKey } from "@/domain/platforms";
import { CONTENT_TYPES, TOPICS, type ContentType, type Region } from "@/domain/types";
import type { DraftField, DraftFields } from "@/server/sources";
import { restorePrefill, startGenerate, updateDraft, type ActionResult } from "../../actions";

type Props = {
  id: string;
  kind: "text" | "audio" | "video";
  /** 视频：横屏 h / 竖屏 v */
  orient?: "h" | "v";
  /** 音频、视频的粗剪面板（替代文本的原文预览） */
  mediaPanel?: React.ReactNode;
  draft: DraftFields;
  titleAlts: string[];
  reasons: { title: string; type: string; topic: string };
  edited: string[];
  hitWords: string[];
  available: PlatformKey[];
  decisions: PlatformDecision[];
  failed: string | null;
  excerpt: string;
  excerptHits: SensitiveHit[];
  size: number;
};

function Tag({ field, edited }: { field: DraftField; edited: string[] }) {
  return edited.includes(field) ? <span className="chip warn">你改过</span> : <span className="chip acc">AI 预填</span>;
}

export function DraftForm(p: Props) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState(p.draft.title);
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setError(r?.error ?? null);
    });
  const patch = (x: Partial<DraftFields>) => run(() => updateDraft(p.id, x));

  const topicOsOnly = TOPICS.find((t) => t.name === p.draft.topic)?.region === "os";
  const cnBlocked = topicOsOnly || p.hitWords.length > 0;
  const toggleRegion = (r: Region) =>
    patch({ regions: p.draft.regions.includes(r) ? p.draft.regions.filter((x) => x !== r) : [...p.draft.regions, r] });
  const togglePlatform = (k: PlatformKey) =>
    patch({ platforms: p.draft.platforms.includes(k) ? p.draft.platforms.filter((x) => x !== k) : [...p.draft.platforms, k] });

  const group = (label: React.ReactNode, keys: PlatformKey[]) =>
    keys.length > 0 && (
      <div className="field">
        <span className="lbl">{label}</span>
        <div className="plat-grid">
          {keys.map((k) => {
            const pl = PLATFORMS[k];
            const d = p.decisions.find((x) => x.key === k);
            const disabled = !d || d.state === "blocked" || (d.state === "off" && d.why !== "not_selected");
            const on = d?.state === "on";
            const why =
              d?.state === "blocked" ? "合规拦截" : d?.state === "off" && d.why === "tbd" ? "以后再定" : d?.state === "off" && d.why === "region_off" ? "没选这个区域" : METHOD_LABEL[pl.method];
            return (
              <button key={k} type="button" className={`plat ${on ? "on" : ""}`} disabled={disabled || pending} onClick={() => togglePlatform(k)}>
                <span className="box">{on ? "✓" : ""}</span>
                <span><b>{pl.name}</b><span>{why}</span></span>
              </button>
            );
          })}
        </div>
      </div>
    );

  return (
    <div className="grid g-side">
      <div className="grid" style={{ alignContent: "start" }}>
        {p.mediaPanel}
        {p.kind !== "text" && (
          <section className="panel">
            <h2>识别出的文字 <small>前 400 字，完整稿在审核页</small></h2>
            <div style={{ fontSize: 13, whiteSpace: "pre-wrap", maxHeight: 160, overflow: "hidden" }}>
              <Highlighted text={p.excerpt} hits={p.excerptHits} />…
            </div>
          </section>
        )}
        {p.kind === "text" && <section className="panel">
          <h2>底稿 <small>已确认，生成时只排版、加小标题和金句，不再改字</small></h2>
          <div className="drop">
            <div className="thumb">{(p.size / 1024).toFixed(1)} KB</div>
            <div style={{ minWidth: 0, fontSize: 13, whiteSpace: "pre-wrap", maxHeight: 140, overflow: "hidden" }}>
              <Highlighted text={p.excerpt} hits={p.excerptHits} />…
            </div>
          </div>
        </section>}

        <section className="panel">
          <h2>发布信息 <small>都已预填，不对就点着改</small></h2>
          {p.failed && <div style={{ marginBottom: 14 }}><Notice tone="bad" icon="!" title="上次生成失败">{p.failed}</Notice></div>}

          <div className="field">
            <span className="lbl">标题 <Tag field="title" edited={p.edited} /></span>
            <input
              className="textin"
              aria-label="标题"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== p.draft.title && patch({ title })}
            />
            <div className="chips">
              {p.titleAlts.filter((t) => t !== p.draft.title).map((t) => (
                <button key={t} type="button" className="chip" disabled={pending} onClick={() => { setTitle(t); patch({ title: t }); }}>
                  换成：{t}
                </button>
              ))}
            </div>
            {!p.edited.includes("title") && <span className="hint">AI 判断：{p.reasons.title}</span>}
          </div>

          {p.kind === "video" ? (
            <div className="field">
              <span className="lbl">视频类型 <Tag field="type" edited={p.edited} /> <span className="chip">{p.orient === "v" ? "竖屏" : "横屏"}</span></span>
              <div className="opts">
                {(["talk", "show", "screen", "vlog"] as ContentType[]).map((t) => (
                  <button key={t} type="button" className={`opt ${p.draft.type === t ? "on" : ""}`} disabled={pending} onClick={() => patch({ type: t })}>{CONTENT_TYPES[t]}</button>
                ))}
              </div>
              {!p.edited.includes("type") && <span className="hint">AI 判断：{p.reasons.type}</span>}
            </div>
          ) : (
            <div className="field">
              <span className="lbl">素材类型</span>
              <div><span className="chip acc">{p.kind === "audio" ? "音频" : "长文本"}</span></div>
            </div>
          )}

          <div className="field">
            <span className="lbl">主题 <Tag field="topic" edited={p.edited} /></span>
            <div className="opts">
              {TOPICS.map((t) => (
                <button key={t.name} type="button" className={`opt ${p.draft.topic === t.name ? "on" : ""}`} disabled={pending} onClick={() => patch({ topic: t.name })}>
                  {t.name}{t.region === "os" && <small>仅海外</small>}
                </button>
              ))}
            </div>
            {!p.edited.includes("topic") && <span className="hint">AI 判断：{p.reasons.topic}</span>}
          </div>

          <div className="field">
            <span className="lbl">发到哪里 <Tag field="regions" edited={p.edited} /></span>
            <div className="opts">
              <button type="button" className={`opt ${p.draft.regions.includes("cn") && !cnBlocked ? "on" : ""}`} disabled={cnBlocked || pending} onClick={() => toggleRegion("cn")}>国内</button>
              <button type="button" className={`opt ${p.draft.regions.includes("os") ? "on" : ""}`} disabled={pending} onClick={() => toggleRegion("os")}>海外</button>
            </div>
          </div>

          <div style={{ marginBottom: 18 }}>
            {cnBlocked ? (
              <Notice tone="bad" icon="⛔" title="国内平台已自动关闭">
                {topicOsOnly && `主题「${p.draft.topic}」按你的规则只发海外。`}
                {p.hitWords.length > 0 && `内容里查到：${p.hitWords.join("、")}，审核页会标出位置。`}
              </Notice>
            ) : (
              <Notice tone="ok" icon="✓" title="国内合规检查通过">内容里没有词库中的敏感词。生成后的文字还会再查一次。</Notice>
            )}
          </div>

          {p.kind === "video" ? (
            <>
              {group(<>视频平台 <Tag field="platforms" edited={p.edited} /></>, p.available.filter((k) => PLATFORMS[k].format === "video"))}
              {group("播客（用剪好的声音）", p.available.filter((k) => PLATFORMS[k].format === "podcast"))}
              {group("整理成文章发到", p.available.filter((k) => PLATFORMS[k].format === "longform"))}
            </>
          ) : p.kind === "audio" ? (
            <>
              {group(<>播客平台 <Tag field="platforms" edited={p.edited} /></>, p.available.filter((k) => PLATFORMS[k].format === "podcast"))}
              {group("整理成文章发到", p.available.filter((k) => PLATFORMS[k].format === "longform"))}
              <span className="hint" style={{ display: "block", margin: "-8px 0 18px" }}>配画面合成视频、发视频平台以后再做。</span>
            </>
          ) : (
            <>
              {group(<>整篇长文发到 <Tag field="platforms" edited={p.edited} /></>, p.available.filter((k) => PLATFORMS[k].format === "longform"))}
              {group("拆成短帖发到", p.available.filter((k) => PLATFORMS[k].format === "post"))}
            </>
          )}

          {error && <div style={{ marginBottom: 12 }}><Notice tone="bad" icon="!" title={error} /></div>}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", flexWrap: "wrap" }}>
            <button type="button" className="btn" disabled={pending || p.edited.length === 0} onClick={() => { run(() => restorePrefill(p.id)); }}>
              恢复 AI 预填
            </button>
            <button type="button" className="btn primary" disabled={pending} onClick={() => run(() => startGenerate(p.id))}>
              {pending ? "处理中…" : "确认，开始生成"}
            </button>
          </div>
        </section>
      </div>

      <aside className="grid" style={{ alignContent: "start" }}>
        <section className="panel">
          <h2>点「确认」之后</h2>
          <div className="row-list" style={{ fontSize: 13 }}>
            {(p.kind === "video"
              ? [["粗剪成片", "按上面的粗剪剪画面和声音，响度统一"], ["字幕", "SRT 文件；竖屏和视频号另出一版字幕烧进画面"], ["封面", "从成片里挑 3 帧，叠上标题后下载"], ["各平台文案", "每个视频平台各自的标题、简介、标签"], ["横屏另出", "勾了播客、公众号、知乎的话，顺带出播客音频和长文"]]
              : p.kind === "audio"
              ? [["播客音频", "按上面的粗剪出成品，响度统一到 -16 LUFS"], ["节目说明", "简介 + 章节时间轴"], ["公众号长文", "把讲的内容整理成文章"], ["知乎", "文章 + 一条想法，标题改成问题式"]]
              : [["公众号长文", "排版、小标题、金句"], ["知乎", "完整文章 + 一条想法，标题改成问题式"], ["短帖", "公众号贴图、小红书图文、微博、YouTube 社区帖，各自改写长度和语气"]]
            ).map(([a, b]) => (
              <div key={a}><div className="t"><b>{a}</b><span>{b}</span></div></div>
            ))}
          </div>
          <p style={{ fontSize: 12, color: "var(--muted)", margin: "10px 0 0" }}>全部好了会进「审核」。没有你批准，什么都不会发布。</p>
        </section>
      </aside>
    </div>
  );
}
