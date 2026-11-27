import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { youtubeConnect } from "@/server/publish/youtube";

/** Google 授权完成后回到这里：核对 state，换刷新令牌，回到设置页 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("yt_state")?.value;
  jar.delete("yt_state");
  const err = url.searchParams.get("error");
  let msg = "ok";
  if (err) msg = err === "access_denied" ? "你取消了授权" : `授权失败：${err}`;
  else if (!expected || url.searchParams.get("state") !== expected) msg = "授权链接过期了，请重新点「连接 YouTube」";
  else {
    try {
      await youtubeConnect(url.searchParams.get("code") ?? "");
    } catch (e) {
      msg = e instanceof Error ? e.message : String(e);
    }
  }
  redirect(`/settings?youtube=${encodeURIComponent(msg)}`);
}
