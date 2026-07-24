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
  "/api/ops",         // NI-5: 운영자 전용(사용금액·리소스·트레이더 관리)
  "/api/feedback",    // NI-6: 피드백 제출(로그인 필수, 신원은 서버 세션에서 기록)
];

// NI-5-c: 운영자(admin) 전용 — 지인(beta)은 접근 불가(서버 강제).
const ADMIN_ONLY_PAGES = ["/pwa/system-health"];
const ADMIN_ONLY_API = ["/api/ops"];

function isProtectedApi(path) {
  return PROTECTED_API_PREFIXES.some((p) => path === p || path.startsWith(p));
}

function matchesPrefix(path, prefixes) {
  return prefixes.some((p) => path === p || path.startsWith(p + "/") || path.startsWith(p));
}

function forbidden() {
  return new NextResponse(JSON.stringify({ ok: false, error: "forbidden" }), {
    status: 403,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
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
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = "/login";
      url.search = `?next=${encodeURIComponent(pathname + req.nextUrl.search)}`;
      return NextResponse.redirect(url);
    }
    // NI-5-c: 운영자 전용 페이지(시스템 상태 등)는 admin만. beta는 /pwa로.
    if (matchesPrefix(pathname, ADMIN_ONLY_PAGES)) {
      const t = tenantFromSession(session);
      if (!t || t.role !== "admin") {
        const url = req.nextUrl.clone();
        url.pathname = "/pwa";
        url.search = "";
        return NextResponse.redirect(url);
      }
    }
    return NextResponse.next();
  }

  // 2) API: 계정별 데이터만 게이트 + 테넌트 강제
  if (pathname.startsWith("/api/")) {
    if (!isProtectedApi(pathname)) return NextResponse.next(); // 공개 API 통과
    if (!session) return unauthorized();

    const t = tenantFromSession(session);
    if (!t) return unauthorized();

    // NI-5-c: 운영자 전용 API(사용금액·리소스 등)는 admin만(프론트 숨김만으론 부족 — 서버 강제).
    if (matchesPrefix(pathname, ADMIN_ONLY_API) && t.role !== "admin") {
      return forbidden();
    }

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
    // [OH-AUTH] 정식 회원 user_id 를 헤더로 실어준다(티어 게이팅·계정별 데이터 스코프용).
    //   세션에 uid 가 있을 때만(구세션/미upsert 는 없음). 클라 위조 방지 위해 항상 서버가 덮어쓴다.
    if (session.uid != null) headers.set("x-oh-user", String(session.uid));
    else headers.delete("x-oh-user");
    return NextResponse.rewrite(url, { request: { headers } });
  }

  return NextResponse.next();
}
