import { describe, expect, it } from "vitest";
import { NAV_ITEMS, isActive } from "./nav-items";

const byHref = (h: string) => NAV_ITEMS.find((i) => i.href === h)!;

describe("isActive", () => {
  it("总览只在根路径高亮", () => {
    expect(isActive(byHref("/"), "/")).toBe(true);
    expect(isActive(byHref("/"), "/review")).toBe(false);
  });
  it("单条详情页高亮内容库", () => {
    expect(isActive(byHref("/library"), "/library/abc")).toBe(true);
    expect(isActive(byHref("/library"), "/library-x")).toBe(false);
  });
});
