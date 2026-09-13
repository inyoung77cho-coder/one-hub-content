// pages/login.js — 로그인 게이트 화면(NI-2/3). 카카오로 로그인한다.
import Head from "next/head";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

// [S36-3] 사유별 문구. "문제가 있었습니다"(무엇이 안 됐는지 모름)를 쓰지 않는다 — 무엇이 안 됐고 지금 뭘 하면 되는지.
//   bad_sig·expired·state_mismatch 는 callback 이 1회 자동 재시도하므로 보통 화면에 안 나온다(재시도도 실패하면 기본 문구).
const MSG = {
  no_code: "로그인이 취소되었습니다.",
  token: "카카오 서버와 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.",
  profile: "카카오 정보를 받아오지 못했습니다. 잠시 후 다시 시도해 주세요.",
  server: "일시적인 문제가 있었습니다. 잠시 후 다시 시도해 주세요.",
};
const DEFAULT_MSG = "로그인에 실패했습니다. 다시 시도해 주세요.";

export default function Login() {
  const router = useRouter();
  const rawNext = typeof router.query.next === "string" ? router.query.next : "/pwa";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pwa";
  const href = `/api/auth/kakao/start?next=${encodeURIComponent(next)}`;

  // [S36-3] 오류 문구는 state 로 옮기고(재렌더에도 유지) URL 의 error 는 지운다 — 성공 후 뒤로가기 시 오류 재노출 방지.
  const [errMsg, setErrMsg] = useState("");
  // [S36-3c] 카카오 버튼 중복 클릭 방지(start 중복 호출이 쿠키 유실 후보 중 하나).
  const [going, setGoing] = useState(false);

  useEffect(() => {
    if (!router.isReady) return;
    const e = typeof router.query.error === "string" ? router.query.error : "";
    if (!e) return;
    setErrMsg(MSG[e] || DEFAULT_MSG);
    // URL 정리(next 는 보존). shallow 로 라우팅 없이 주소만 교체.
    const q = typeof router.query.next === "string" ? `?next=${encodeURIComponent(next)}` : "";
    router.replace(`/login${q}`, undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady, router.query.error]);

  // [S31-3] 공개 도구(www)에서 넘어온 유입을 앱 origin 에 저장 — OAuth 왕복 뒤 온보딩이 읽어
  //   그 단지를 미리 채우고, 가입 전환을 기록한다. 개인정보 아님(단지명·출처만).
  useEffect(() => {
    if (!router.isReady) return;
    const clean = (s, n) => (typeof s === "string" ? s.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, n) : "");
    const src = clean(router.query.src, 16);
    const vid = clean(router.query.v, 3);
    if (router.query.from === "estimate") {
      try {
        localStorage.setItem("onehub_from", JSON.stringify({
          from: "estimate",
          apt: typeof router.query.apt === "string" ? router.query.apt : "",
          region: typeof router.query.region === "string" ? router.query.region : "",
          src, ts: Date.now(),
        }));
      } catch (e) {}
    }
    // [S34-3] 첫 접점(first-touch)을 앱 origin 에 심는다 — 교차출처(www→app) 우회. ★이미 신선한 값이 있으면 덮지 않음, 30일.
    //   funnel.js 가 signup·first_verdict 때 이 값으로 출처를 서버 집계에 보낸다. 출처 문자열 하나만.
    if (src) {
      try {
        const cur = JSON.parse(localStorage.getItem("onehub_first_src") || "null");
        const fresh = cur && cur.ts && (Date.now() - Number(cur.ts) < 30 * 86400000);
        if (!fresh) localStorage.setItem("onehub_first_src", JSON.stringify({ src: vid ? `${src}:${vid}` : src, ts: Date.now() }));
      } catch (e) {}
    }
  }, [router.isReady, router.query.from, router.query.apt, router.query.region, router.query.src, router.query.v]);

  return (
    <>
      <Head>
        <title>로그인 · ONE·HUB</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="wrap">
        <div className="card">
          <div className="brand">ONE·HUB</div>
          <p className="tagline">주식·ETF·부동산을 AI와 함께 운영하는 통합 자산관리</p>
          <p className="lead">로그인하고 내 자산을 시작하세요.</p>

          {errMsg && <p className="err">{errMsg}</p>}

          <a
            className={`kakao${going ? " going" : ""}`}
            href={href}
            aria-disabled={going}
            onClick={(e) => {
              if (going) { e.preventDefault(); return; } // 두 번째 클릭은 막는다
              setGoing(true);
            }}
          >
            <span className="ic" aria-hidden>💬</span> {going ? "이동 중…" : "카카오로 시작하기"}
          </a>

          <p className="note">
            로그인 시 <a href="/terms" target="_blank" rel="noreferrer">이용약관</a> 및{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>에 동의하는 것으로 간주됩니다. · 시험 사용 단계
          </p>
        </div>
      </main>

      <style jsx>{`
        .wrap {
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
          background: #0f172a;
        }
        .card {
          width: 100%;
          max-width: 380px;
          background: #ffffff;
          border-radius: 18px;
          padding: 36px 26px 28px;
          text-align: center;
          box-shadow: 0 12px 40px rgba(0, 0, 0, 0.35);
        }
        .brand {
          font-size: 1.5rem;
          font-weight: 900;
          letter-spacing: 0.02em;
          color: #0f172a;
        }
        .tagline {
          margin: 8px 0 0;
          font-size: 0.8rem;
          color: #64748b;
          line-height: 1.5;
        }
        .lead {
          margin: 22px 0 16px;
          font-size: 0.95rem;
          font-weight: 700;
          color: #0f172a;
        }
        .kakao {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 100%;
          padding: 14px 0;
          border-radius: 12px;
          background: #fee500;
          color: #191600;
          font-size: 0.98rem;
          font-weight: 800;
          text-decoration: none;
        }
        .kakao:active {
          filter: brightness(0.96);
        }
        .kakao.going {
          pointer-events: none;
          opacity: 0.65;
        }
        .ic {
          font-size: 1.05rem;
        }
        .err {
          margin: 0 0 14px;
          font-size: 0.82rem;
          color: #dc2626;
        }
        .note {
          margin: 16px 0 0;
          font-size: 0.72rem;
          color: #64748b; /* [S36 별건] 약관 안내는 표시 의무 — #94a3b8 은 흰 배경 대비 부족(≈2.6:1)이라 #64748b(≈4.9:1, AA)로 */
          line-height: 1.5;
        }
        /* [S36 별건] 약관·개인정보 링크: 흰 배경에서 확실히 보이게 대비 강화(#4338ca ≈ 8.6:1) + 굵게.
           전역 a{color:inherit} 와 a{user-select:none}(styles/globals.css) 때문에 흐릿하고 복사도 안 됐다 —
           표시 의무가 있는 링크이므로 선택·복사도 허용한다. */
        .note a {
          color: #4338ca;
          font-weight: 600;
          text-decoration: underline;
          -webkit-user-select: text;
          user-select: text;
        }
      `}</style>
    </>
  );
}
