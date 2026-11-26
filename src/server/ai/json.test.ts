import { describe, expect, it } from "vitest";
import { extractJson } from "./json";

describe("extractJson", () => {
  it("纯 JSON", () => expect(extractJson('{"a":1}')).toEqual({ a: 1 }));
  it("代码块", () => expect(extractJson('好的：\n```json\n{"a":2}\n```')).toEqual({ a: 2 }));
  it("前后有文字，字符串里有括号", () => expect(extractJson('输出如下 {"a":"}{","b":[1]} 完毕')).toEqual({ a: "}{", b: [1] }));
  it("无法解析时报错", () => expect(() => extractJson("没有 JSON")).toThrow(/不是有效的 JSON/));
});
