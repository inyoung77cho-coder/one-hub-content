import "../styles/globals.css";
import Nav from "../components/Nav";
import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function App({ Component, pageProps }) {
  const router = useRouter();
  // [v8.6] PWA 화면(/pwa)은 자체 헤더+탭바를 갖고 있어 데스크탑용 글로벌 Nav와 중복됨 → PWA 라우트에서는 글로벌 Nav 숨김
  const isPWARoute = router.pathname.startsWith("/pwa");

  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);

  return (
    <>
      <Head>
        <meta name="google-site-verification" content="Sqkl2VEdEQR2Calqdn4Fxa4QzLTk56dNTvpJBaMuIEs" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#F4F9FF" />
        <link rel="icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="ONE-HUB" />
      </Head>
      {!isPWARoute && <Nav />}
      <Component {...pageProps} />
    </>
  );
}
