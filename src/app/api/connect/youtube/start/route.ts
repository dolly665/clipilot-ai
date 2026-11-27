import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { youtubeAuthUrl } from "@/server/publish/youtube";

/** 跳去 Google 授权；state 放在 cookie 里，回调时核对 */
export async function GET() {
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("yt_state", state, { httpOnly: true, sameSite: "lax", maxAge: 600, path: "/" });
  try {
    return Response.redirect(youtubeAuthUrl(state), 302);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : String(e), { status: 400 });
  }
}
