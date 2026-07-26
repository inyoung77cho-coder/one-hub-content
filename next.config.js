/** @type {import('next').NextConfig} */

// 도메인 분리(2026-07-26): 홈페이지=www.one-hub.kr, PWA=app.one-hub.kr.
//  · app 으로 들어온 '마케팅' 경로(홈/스토리/주간/보드 등) → www 로 이동(주소 일관성).
//  · app 전용(/pwa·/login·/api·/_next·정적파일)은 app 유지 — PWA·카카오 로그인 콜백이
//    app 기준으로 등록돼 있어 이동하면 안 된다.
//  · www 로 들어온 앱 경로(/pwa·/login·/api/auth) → app 으로 되돌림
//    (세션 쿠키·OAuth 콜백이 app 도메인 기준이라 www 에서 열면 로그인 루프).
// ⚠️ 이 리다이렉트는 www 가 실제로 뜬 뒤 배포해야 한다(먼저 배포하면 홈이 없는 www 로 튕김).
const APP_HOST = "app.one-hub.kr";
const WWW_HOST = "www.one-hub.kr";
const hostIs = (value) => [{ type: "host", value }];

const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      // app → www : 루트 홈
      { source: "/", has: hostIs(APP_HOST), destination: `https://${WWW_HOST}/`, permanent: false },
      // app → www : 마케팅 경로 전부. pwa·api·login·_next·확장자파일은 제외(app 유지).
      {
        source: "/:path((?!pwa$|pwa/|api/|login$|login/|_next/|.*\\.).*)",
        has: hostIs(APP_HOST),
        destination: `https://${WWW_HOST}/:path`,
        permanent: false,
      },
      // www → app : 앱 경로는 app 으로 되돌림
      { source: "/pwa", has: hostIs(WWW_HOST), destination: `https://${APP_HOST}/pwa`, permanent: false },
      { source: "/pwa/:path*", has: hostIs(WWW_HOST), destination: `https://${APP_HOST}/pwa/:path*`, permanent: false },
      { source: "/login", has: hostIs(WWW_HOST), destination: `https://${APP_HOST}/login`, permanent: false },
      { source: "/login/:path*", has: hostIs(WWW_HOST), destination: `https://${APP_HOST}/login/:path*`, permanent: false },
      { source: "/api/auth/:path*", has: hostIs(WWW_HOST), destination: `https://${APP_HOST}/api/auth/:path*`, permanent: false },
    ];
  },
};

module.exports = nextConfig;
