"use client";

import { useState, useSyncExternalStore } from "react";
import type { Article } from "@/domain/longform";
import { articleToMarkdown } from "@/domain/longform";
import { DEFAULT_WECHAT_THEME, renderWechatHtml, WECHAT_THEMES, type WechatThemeId } from "@/domain/wechat";
import { RichCopyButton } from "./RichCopyButton";

const KEY = "qingqing.wechatTheme";

function readSaved(): WechatThemeId {
  try {
    const v = localStorage.getItem(KEY);
    if (v && v in WECHAT_THEMES) return v as WechatThemeId;
  } catch {}
  return DEFAULT_WECHAT_THEME;
}
const noSubscribe = () => () => {};

/** 公众号：选排版主题 + 复制富文本。上次选的主题记在本机浏览器里。 */
export function WechatCopy({ article }: { article: Article }) {
  // 服务端渲染用默认主题，浏览器里读上次选的，避免水合不一致
  const saved = useSyncExternalStore(noSubscribe, readSaved, () => DEFAULT_WECHAT_THEME);
  const [picked, setPicked] = useState<WechatThemeId | null>(null);
  const theme = picked ?? saved;
  const choose = (t: WechatThemeId) => {
    setPicked(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {}
  };
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <select
        aria-label="公众号排版主题"
        className="textin"
        style={{ width: "auto", fontSize: 13, padding: "4px 8px" }}
        value={theme}
        onChange={(e) => choose(e.target.value as WechatThemeId)}
      >
        {(Object.keys(WECHAT_THEMES) as WechatThemeId[]).map((id) => (
          <option key={id} value={id}>{WECHAT_THEMES[id].name}</option>
        ))}
      </select>
      <RichCopyButton html={renderWechatHtml(article, { theme })} text={articleToMarkdown(article)} />
    </span>
  );
}
