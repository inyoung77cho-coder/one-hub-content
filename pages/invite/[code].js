// pages/invite/[code].js — NI-7-a 지인 초대 랜딩(로그인 前 공개).
// 링크로 들어온 지인에게 "베타 테스터 · 평생무료" 프레임을 보여주고 카카오 로그인으로 흘려보낸다.
// 등급은 로그인 세션에서 파생(모든 로그인 유저=beta+평생무료, NI-5) — 코드 자체는 환영 문맥용.
import Head from "next/head";
import { useRouter } from "next/router";

export default function Invite() {
  const router = useRouter();
  // 로그인 후 온보딩(첫 데이터)으로 — NI-7-b 첫 경험
  const start = () => { window.location.href = `/api/auth/kakao/start?next=${encodeURIComponent("/pwa")}`; };

  return (
    <>
      <Head>
        <title>ONE·HUB 베타 초대</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="wrap">
        <div className="card">
          <div className="badge">🧪 베타 초대장</div>
          <div className="brand">ONE·HUB</div>
          <p className="tag">주식 · ETF · 부동산을 AI와 함께 운영하는 통합 자산관리</p>

          <div className="box">
            <p className="lead">먼저 써보시라고 모셨어요.</p>
            <ul className="pts">
              <li>✅ 정식 출시 후에도 <b>무료</b> (베타 테스터 특전)</li>
              <li>✅ 카카오로 <b>10초</b>면 시작</li>
              <li>✅ 불편한 건 앱 안 <b>💬 버튼</b>으로 바로 알려주시면 큰 도움이 돼요</li>
            </ul>
          </div>

          <button className="kakao" onClick={start}>💬 카카오로 시작하기</button>
          <p className="consent">
            시작하면 <a href="/terms" target="_blank" rel="noreferrer">이용약관</a> ·{" "}
            <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>에 동의합니다.
          </p>
          <p className="note">아직 개발 중인 앱을 먼저 보시는 겁니다. 완성품이 아니라 <b>만들어지는 과정</b>에 함께해 주세요.</p>
        </div>
      </main>

      <style jsx>{`
        .wrap { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; background: #0f172a; }
        .card { width: 100%; max-width: 400px; background: #fff; border-radius: 18px; padding: 30px 24px 24px; text-align: center; box-shadow: 0 12px 40px rgba(0,0,0,0.35); }
        .badge { display: inline-block; font-size: 0.72rem; font-weight: 800; color: #4f46e5; background: rgba(79,70,229,0.12); padding: 5px 12px; border-radius: 20px; margin-bottom: 14px; }
        .brand { font-size: 1.6rem; font-weight: 900; letter-spacing: 0.02em; color: #0f172a; }
        .tag { margin: 8px 0 18px; font-size: 0.8rem; color: #64748b; line-height: 1.5; }
        .box { text-align: left; background: #f8fafc; border-radius: 12px; padding: 16px 16px 8px; margin-bottom: 18px; }
        .lead { margin: 0 0 10px; font-weight: 800; color: #0f172a; font-size: 0.95rem; }
        .pts { margin: 0; padding: 0; list-style: none; }
        .pts li { font-size: 0.83rem; color: #334155; line-height: 1.7; margin-bottom: 6px; }
        .kakao { width: 100%; padding: 15px 0; border: none; border-radius: 12px; background: #fee500; color: #191600; font-size: 1rem; font-weight: 800; cursor: pointer; }
        .kakao:active { filter: brightness(0.96); }
        .consent { margin: 12px 0 0; font-size: 0.72rem; color: #64748b; }
        .consent a { color: #4f46e5; text-decoration: underline; }
        .note { margin: 10px 0 0; font-size: 0.72rem; color: #94a3b8; line-height: 1.6; }
      `}</style>
    </>
  );
}
