/**
 * 从模型输出里取出 JSON 对象。容错规则沿用旧版 extractJSON：
 * 先试整段，再试 ``` 代码块，再试第一个括号配平的 {...}。
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  const fence = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(trimmed);
  if (fence?.[1]) {
    try {
      return JSON.parse(fence[1].trim());
    } catch {}
  }

  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < trimmed.length; i++) {
    const c = trimmed[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') inString = true;
    else if (c === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (c === "}" && depth > 0) {
      depth--;
      if (depth === 0 && start >= 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          start = -1;
        }
      }
    }
  }
  throw new Error(`模型输出不是有效的 JSON。开头是：${trimmed.slice(0, 200)}`);
}
