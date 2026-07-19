// middleware.js — 로그인 게이트(NI-2). 보호 경로에 세션이 없으면
// 페이지는 /login으로 리다이렉트, API는 401을 반환한다.
// ⚠️ 랜딩(/)·로그인(/login)·인증 API(/api/auth/*)·정적파일은 공개(matcher에서 제외).
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/auth";

// 보호 대상 = PWA 앱 화면(+ /pwa 하위 데이터 API). 나머지는 공개.
export const config = {
  matcher: ["/pwa", "/pwa/:path*"],
};

export async function middleware(req) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);
  if (session) return NextResponse.next();

  const { pathname, search } = req.nextUrl;
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}
