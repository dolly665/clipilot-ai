export type NavItem = { href: string; label: string; /** 这些路径前缀也算高亮本项 */ also?: string[] };

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "总览" },
  { href: "/new", label: "上传新内容" },
  { href: "/manuscripts", label: "底稿库" },
  { href: "/library", label: "内容库" },
  { href: "/review", label: "审核" },
  { href: "/publish", label: "发布中心" },
  { href: "/templates", label: "模板" },
  { href: "/settings", label: "平台与规则" },
];

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return pathname === item.href || pathname.startsWith(item.href + "/");
}
