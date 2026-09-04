import "../styles/globals.css";
import Nav from "../components/Nav";
import EngineVersionBanner from "../components/EngineVersionBanner";
import SplashScreen from "../components/SplashScreen";
import InstallPrompt from "../components/InstallPrompt"; // [S24-4] 홈 화면 추가 유도(3일차 1회)
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Analytics } from "@vercel/analytics/react";
import { initSync } from "../lib/syncManager";
import { getTrader } from "../lib/trader";
import { enforceUserBoundary } from "../lib/session";

// 페이지 로드당 1회만 로그인 경계 검사(사용자 전환 시 로컬 상태 초기화).
let boundaryChecked = false;

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPWARoute = router.pathname.startsWith("/pwa");
  const isHome = router.pathname === "/"; // 홈은 자체 네이비 nav 사용 → 전역 Nav 숨김

  // [S24-4] PWA 화면 앱 느낌 — 핀치 확대 차단(user-scalable=no). 단 설정의 '화면 확대 허용' 토글로 되살릴 수 있게
  //   런타임 viewport 를 바꾼다(WCAG 1.4.4 탈출구). 마케팅 페이지는 각자 viewport 를 선언하므로 영향 없음.
  const [allowZoom, setAllowZoom] = useState(false);
  useEffect(() => {
    const read = () => { try { setAllowZoom(localStorage.getItem("onehub_allow_zoom") === "1"); } catch (e) {} };
    read();
    window.addEventListener("onehub-zoom-change", read);
    return () => window.removeEventListener("onehub-zoom-change", read);
  }, []);
  const vpContent = allowZoom
    ? "width=device-width, initial-scale=1, viewport-fit=cover"
    : "width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no, maximum-scale=1";

  // [공용기기 방어] 로그인한 사용자가 이 기기의 직전 사용자와 다르면 로컬 상태를 초기화한다.
  //   로그아웃 없이 다음 사람이 로그인하는 경우(가장 흔함)까지 커버. 초기화 시 1회 새로고침.
  useEffect(() => {
    if (boundaryChecked || typeof window === "undefined") return;
    if (!router.pathname.startsWith("/pwa")) return;
    boundaryChecked = true;
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && d.authenticated && d.user && d.user.id) {
          if (enforceUserBoundary(d.user.id)) window.location.reload();
        }
      })
      .catch(() => {});
  }, [router.pathname]);

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  // [기기 동기화] PC↔모바일 자산 입력 정합(충돌 시 모바일 우선). 백엔드 미배포 시 로컬만(회귀 없음).
  useEffect(() => {
    if (typeof window === "undefined") return;
    let cleanup;
    let cancelled = false;
    const run = async () => { const c = await initSync(getTrader()); if (cancelled) c && c(); else cleanup = c; };
    run();
    const onTrader = () => { if (cleanup) cleanup(); run(); };
    window.addEventListener("onehub-trader-change", onTrader);
    return () => { cancelled = true; if (cleanup) cleanup(); window.removeEventListener("onehub-trader-change", onTrader); };
  }, []);

  // [v10 UI] 다크모드 단일 소스 — <html data-theme> 를 onehub_theme(localStorage)와 동기화.
  //   설정 탭 토글이 localStorage 를 바꾸고 'onehub-theme-change' 이벤트를 쏘면 즉시 반영.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const apply = () => {
      let t = "light";
      try { t = window.localStorage.getItem("onehub_theme") || "light"; } catch (e) {}
      document.documentElement.setAttribute("data-theme", t === "dark" ? "dark" : "light");
    };
    apply();
    window.addEventListener("storage", apply);           // 다른 탭에서 변경
    window.addEventListener("onehub-theme-change", apply); // 같은 탭 토글
    router.events.on("routeChangeComplete", apply);       // 라우트 이동 시 재확인
    return () => {
      window.removeEventListener("storage", apply);
      window.removeEventListener("onehub-theme-change", apply);
      router.events.off("routeChangeComplete", apply);
    };
  }, [router.events]);

  // [S29-4] 설정으로 들어갈 때 '직전 화면' 경로를 기억 — 설정의 의견 보내기가 정확한 화면 이름을 첨부하도록.
  useEffect(() => {
    const onStart = (url) => {
      try { if (String(url).includes("/pwa/settings")) sessionStorage.setItem("onehub_prev_path", router.pathname); } catch (e) {}
    };
    router.events.on("routeChangeStart", onStart);
    return () => router.events.off("routeChangeStart", onStart);
  }, [router.events, router.pathname]);

  return (
    <>
      <Head>
        {/* [S24-4] PWA 화면만 앱 뷰포트(핀치 차단·safe-area). 마케팅 페이지는 자체 viewport 로 override. */}
        {isPWARoute && <meta name="viewport" content={vpContent} />}
        <meta name="google-site-verification" content="Sqkl2VEdEQR2Calqdn4Fxa4QzLTk56dNTvpJBaMuIEs" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.css" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F4F9FF" />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ONE-HUB" />
      </Head>
      {isPWARoute && <SplashScreen />}
      {!isPWARoute && <Nav />}
      {/* [S17-0 Part3] 엔진 버전·계약 불일치를 PWA 전 화면에서 알린다.
          한 화면만 정직하면 의미가 없다. 정상이면 아무것도 그리지 않는다. */}
      {isPWARoute && <EngineVersionBanner />}
      {isPWARoute && <InstallPrompt />}
      <Component {...pageProps} />
      <Analytics />
    </>
  );
}
