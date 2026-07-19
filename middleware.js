// middleware.js — NI-2 로그인 게이트 + NI-4 계정별 데이터 격리(단일 강제 지점).
//  · /pwa, /pwa/* : 세션 없으면 /login 리다이렉트(페이지 게이트)
//  · 계정별 데이터 API : 세션 없으면 401 + trader/trader_id 쿼리를 세션 테넌트로 덮어씀
//    (클라가 보낸 trader 무시 → 남의 데이터 조회 차단). POST 본문 라우트는 x-oh-tenant 헤더 채택.
//  · 그 외 공개 API(auth·health·og·시세 등)는 통과.
import { NextResponse } from "next/server";
import { verifySession, SESSION_COOKIE } from "./lib/auth";
import { tenantFromSession } from "./lib/tenant";

export const config = {
  matcher: ["/pwa", "/pwa/:path*", "/api/:path*"],
};

// 로그인 필요 + 테넌트 강제 대상(계정별 데이터). fail-closed: 목록 밖 /api는 공개로 통과.
const PROTECTED_API_PREFIXES = [
  "/api/assets/total",
  "/api/notifications",
  "/api/pwa-",        // pwa-dashboard, pwa-history, pwa-watchlist, ... (하이픈 계열 전부)
  "/api/pwa/",        // pwa/accuracy, pwa/etf/*, pwa/re/*, pwa/sell
  "/api/user/state",
  "/api/user/",
  "/api/input/",
  "/api/approve-pending",
  "/api/skip-pending",
  "/api/queue-pending",
  "/api/push-subscribe",
  "/api/push-unsubscribe",
  "/api/realestate/v2",
  "/api/trader-verify",
  "/api/trader-register",
];

function isProtectedApi(path) {
  return PROTECTED_API_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function unauthorized() {
  return new NextResponse(JSON.stringify({ ok: false, error: "unauthorized" }), {
    status: 401,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = await verifySession(token);

  // 1) 페이지 게이트: /pwa
  if (pathname === "/pwa" || pathname.startsWith("/pwa/")) {
    if (session) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
    return NextResponse.redirect(url);
  }

  // 2) API: 계정별 데이터만 게이트 + 테넌트 강제
  if (pathname.startsWith("/api/")) {
    if (!isProtectedApi(pathname)) return NextResponse.next(); // 공개 API 통과
    if (!session) return unauthorized();

    const t = tenantFromSession(session);
    if (!t) return unauthorized();

    // 관리자(InYoung)는 A/B 전환 허용. 그 외 사용자는 세션 테넌트 강제(클라값 무시).
    const requested =
      req.nextUrl.searchParams.get("trader") || req.nextUrl.searchParams.get("trader_id");
    let effective = t.tenant;
    if (t.role === "admin" && (requested === "A" || requested === "B")) {
      effective = requested;
    }

    const url = req.nextUrl.clone();
    url.searchParams.set("trader", effective);
    url.searchParams.set("trader_id", effective);

    const headers = new Headers(req.headers);
    headers.set("x-oh-tenant", effective);
    headers.set("x-oh-role", t.role);
    return NextResponse.rewrite(url, { request: { headers } });
  }

  return NextResponse.next();
}
