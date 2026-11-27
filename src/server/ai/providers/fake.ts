import type { AiProvider, CompleteRequest } from "../types";

/**
 * 不联网的假提供方：开发和测试用。根据任务名和提示词里的素材内容，
 * 返回结构正确、内容可预测的 JSON。
 */
export function createFakeProvider(): AiProvider {
  return {
    name: "fake",
    model: "fake",
    async complete(req: CompleteRequest) {
      const r = fakeResult(req);
      return typeof r === "string" ? r : JSON.stringify(r);
    },
  };
}

function between(text: string, open: string, close: string): string {
  const s = text.indexOf(open);
  const e = text.indexOf(close, s + open.length);
  return s >= 0 && e >= 0 ? text.slice(s + open.length, e).trim() : "";
}

function firstLine(text: string): string {
  return (text.split("\n").find((l) => l.trim()) ?? "无题").replace(/^\[\d+\]\s*/, "").trim();
}

function clip(s: string, n: number) {
  return [...s].slice(0, n).join("");
}

function guessTopic(text: string) {
  if (/修行|打坐|禅/.test(text)) return "修行";
  if (/玄学|法界|烧纸|风水/.test(text)) return "玄学·法界";
  if (/AI|Claude|模型|自动化/i.test(text)) return "AI 实操";
  if (/心理|情绪|边界/.test(text)) return "心理学";
  if (/人情|关系|饭局|领导/.test(text)) return "人情世故";
  return "生活";
}

function fakeResult({ task, user }: CompleteRequest): unknown {
  switch (task) {
    case "understand": {
      const text = between(user, "<<<素材内容", "素材内容>>>");
      const kind = /素材种类：(\w+)/.exec(user)?.[1] ?? "text";
      const t = clip(firstLine(text), 18);
      return {
        title: t,
        titleAlts: [`${clip(t, 14)}（备选一）`, `${clip(t, 14)}（备选二）`],
        type: kind === "text" ? "text" : kind === "audio" ? "audio" : "talk",
        topic: guessTopic(text),
        reasons: { title: "取自开头第一句（假数据）", type: "按素材种类判断（假数据）", topic: "按关键词判断（假数据）" },
      };
    }
    case "longform": {
      const paras = between(user, "<<<原文", "原文>>>").split(/\n\n+/).filter(Boolean);
      const firstSentence = (paras[0] ?? "").replace(/^\[\d+\]\s*/, "").split(/[。！？]/)[0] ?? "";
      const headings = [{ before: 0, text: "先说结论" }];
      if (paras.length > 2) headings.push({ before: Math.floor(paras.length / 2), text: "再往深一层" });
      return {
        title: /预填标题：(.*)/.exec(user)?.[1]?.trim() || "无题",
        lead: "这是假数据生成的导语。",
        headings,
        quotes: firstSentence ? [firstSentence] : [],
      };
    }
    case "zhihu": {
      const title = /文章标题：(.*)/.exec(user)?.[1]?.trim() ?? "这件事";
      return { question: `如何看待「${clip(title, 20)}」？`, idea: `【假数据】${clip(between(user, "<<<原文", "原文>>>"), 200)}` };
    }
    case "text-kind": {
      const text = between(user, "<<<文字（只给开头部分）", "文字>>>");
      const fillers = (text.match(/嗯|呃|那个|就是说|然后/g) ?? []).length;
      const punct = (text.match(/[。！？，]/g) ?? []).length;
      const spoken = fillers >= 2 || punct < [...text].length / 60;
      return spoken
        ? { mode: "polish", reason: `有 ${fillers} 处口头词，标点少（假数据）` }
        : { mode: "layout", reason: "段落和标点规范，像写好的文章（假数据）" };
    }
    case "polish": {
      // 假润色：去口头词、去紧挨着的重复、每三句分一段
      const text = between(user, "<<<待理顺", "待理顺>>>")
        .replace(/[嗯呃额]|那个|就是说/g, "")
        .replace(/(.{2,4})\1/g, "$1")
        .replace(/\s+/g, "");
      const sentences = text.match(/[^。！？]+[。！？]?/g) ?? [text];
      const paras: string[] = [];
      for (let i = 0; i < sentences.length; i += 3) paras.push(sentences.slice(i, i + 3).join(""));
      return paras.join("\n\n");
    }
    case "short-posts": {
      const text = between(user, "<<<原文", "原文>>>");
      const title = /文章标题：(.*)/.exec(user)?.[1]?.trim() ?? "无题";
      const sentences = (text.match(/[^。！？\n]+[。！？]?/g) ?? [text]).map((x) => x.trim()).filter(Boolean);
      const cards = sentences.slice(0, 4).map((b, i) => ({ title: `第 ${i + 1} 点`, body: clip(b, 90) }));
      const deck = { cover: { title: clip(title, 14), subtitle: "假数据生成的副标题" }, cards: cards.length ? cards : [{ title: "要点", body: "（空）" }] };
      return {
        gzhp: { title: clip(title, 20), text: clip(text, 300), ...deck },
        xhsn: { title: clip(title, 20), text: clip(text, 500), tags: ["允安", "成长"], ...deck },
        wb: { text: clip(text, 140) },
        ytc: { text: clip(text, 300) },
      };
    }
    case "spoken-article": {
      const text = between(user, "<<<口播稿", "口播稿>>>");
      const lines = text.split("\n").filter(Boolean);
      const half = Math.ceil(lines.length / 2);
      return {
        title: /预填标题：(.*)/.exec(user)?.[1]?.trim() || "无题",
        lead: "这是假数据整理的导语。",
        blocks: [
          { type: "heading", text: "先说结论" },
          { type: "paragraph", text: lines.slice(0, half).join("") || "（空）" },
          { type: "heading", text: "再往深一层" },
          { type: "paragraph", text: lines.slice(half).join("") || "（空）" },
        ],
      };
    }
    case "shownotes": {
      const times = [...between(user, "<<<逐句稿", "逐句稿>>>").matchAll(/^\[([\d:]+)\]/gm)].map((m) => m[1]!);
      const pick = [times[0] ?? "00:00", times[Math.floor(times.length / 2)] ?? "00:00"];
      return { summary: "【假数据】这期聊聊作者最近的一些想法。", chapters: [{ at: pick[0], title: "开场" }, { at: pick[1], title: "正题" }] };
    }
    case "video-copy": {
      const title = /预填标题：(.*)/.exec(user)?.[1]?.trim() ?? "无题";
      const keys = [...between(user, "要写文案的平台（只写这几个）：", "<<<视频逐句稿").matchAll(/^- (\w+)：/gm)].map((m) => m[1]!);
      const text = clip(between(user, "<<<视频逐句稿", "视频逐句稿>>>").replace(/\n/g, ""), 60);
      return { platforms: Object.fromEntries(keys.map((k) => [k, { title: clip(title, 20), desc: `【假数据】${text}`, tags: ["允安", "成长"] }])) };
    }
    default:
      throw new Error(`fake 提供方不认识任务 ${task}`);
  }
}
