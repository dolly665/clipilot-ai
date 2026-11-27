import type { Region } from "./types";

/** 账号名：国内统一叫「允安」（含播客），海外叫「时予清」。清清界面本身不随这个改。 */
export const ACCOUNT_NAME: Record<Region, string> = { cn: "允安", os: "时予清" };

export function accountName(region: Region): string {
  return ACCOUNT_NAME[region];
}
