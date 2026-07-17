import "../styles/globals.css";
import Nav from "../components/Nav";
import EngineVersionBanner from "../components/EngineVersionBanner";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { initSync } from "../lib/syncManager";
import { getTrader } from "../lib/trader";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const isPWARoute = router.pathname.startsWith("/pwa");
  const isHome = router.pathname === "/"; // 홈은 자체 네이비 nav 사용 → 전역 Nav 숨김

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

  return (
    <>
      <Head>
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
      {!isPWARoute && <Nav />}
      {/* [S17-0 Part3] 엔진 버전·계약 불일치를 PWA 전 화면에서 알린다.
          한 화면만 정직하면 의미가 없다. 정상이면 아무것도 그리지 않는다. */}
      {isPWARoute && <EngineVersionBanner />}
      <Component {...pageProps} />
    </>
  );
}
