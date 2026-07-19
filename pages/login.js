// pages/login.js — 로그인 게이트 화면(NI-2/3). 카카오로 로그인한다.
import Head from "next/head";
import { useRouter } from "next/router";

export default function Login() {
  const router = useRouter();
  const rawNext = typeof router.query.next === "string" ? router.query.next : "/pwa";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/pwa";
  const error = typeof router.query.error === "string" ? router.query.error : "";
  const href = `/api/auth/kakao/start?next=${encodeURIComponent(next)}`;

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

          {error && <p className="err">로그인에 문제가 있었습니다. 다시 시도해 주세요.</p>}

          <a className="kakao" href={href}>
            <span className="ic" aria-hidden>💬</span> 카카오로 시작하기
          </a>

          <p className="note">가입/로그인 시 서비스 이용에 동의하는 것으로 간주됩니다. · 시험 사용 단계</p>
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
          font-size: 0.7rem;
          color: #94a3b8;
          line-height: 1.5;
        }
      `}</style>
    </>
  );
}
