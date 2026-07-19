// pages/privacy.js — PP-1 개인정보 처리방침(베타 최소본). 정식 공개(P3) 시 법률 검토로 고도화.
import Head from "next/head";
import Link from "next/link";

const UPDATED = "2026-07-19";

export default function Privacy() {
  return (
    <>
      <Head>
        <title>개인정보 처리방침 · ONE·HUB</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="doc">
        <h1>개인정보 처리방침</h1>
        <p className="meta">ONE·HUB(이하 “서비스”) · 시행일 {UPDATED} · <b>베타(시험) 서비스</b></p>

        <p className="lead">
          ONE·HUB는 지인 대상 시험(베타) 단계 서비스로, 아래와 같이 최소한의 개인정보만 수집·이용합니다.
          정식 공개 시 본 방침은 법률 검토를 거쳐 개정됩니다.
        </p>

        <h2>1. 수집하는 개인정보 항목</h2>
        <ul>
          <li>카카오 로그인 정보: <b>닉네임</b>(필수), 이메일(선택·동의 시)</li>
          <li>이용자가 직접 입력한 자산 정보: 관심단지·보유종목/ETF·부동산 보유·투자성향 등</li>
          <li>서비스 이용 중 남긴 피드백 내용</li>
        </ul>

        <h2>2. 수집·이용 목적</h2>
        <ul>
          <li>로그인 및 이용자 식별, 계정별 데이터 분리 제공</li>
          <li>자산 분석·AI 판단 등 서비스 기능 제공 및 개선</li>
          <li>피드백 확인 및 응대</li>
        </ul>

        <h2>3. 보유 및 이용 기간</h2>
        <p>회원 탈퇴 시까지 보유하며, 탈퇴 요청 시 지체 없이 파기합니다. 관련 법령상 보존 의무가 있는 경우 해당 기간 동안 보관합니다.</p>

        <h2>4. 제3자 제공 및 처리 위탁</h2>
        <p>이용자의 개인정보를 제3자에게 제공하지 않습니다. 로그인은 카카오(주)를 통해 이루어지며, 서비스는 카카오가 제공한 최소 정보(닉네임 등)만 이용합니다.</p>

        <h2>5. 파기</h2>
        <p>보유 기간 경과 또는 처리 목적 달성 시 지체 없이 파기합니다. 전자적 파일은 복구 불가능한 방법으로 삭제합니다.</p>

        <h2>6. 이용자의 권리</h2>
        <p>이용자는 언제든지 본인 정보의 열람·정정·삭제·처리정지 및 회원 탈퇴를 요청할 수 있습니다. 요청은 아래 문의처로 접수합니다.</p>

        <h2>7. 안전조치</h2>
        <p>계정별 데이터 분리, 전송 구간 암호화(HTTPS), 접근 통제를 적용합니다.</p>

        <h2>8. 문의</h2>
        <p>개인정보 관련 문의는 서비스 내 <b>💬 피드백</b> 또는 운영자에게 연락해 주세요.</p>

        <p className="foot"><Link href="/terms">이용약관</Link> · <Link href="/">홈으로</Link></p>
      </main>
      <style jsx>{`
        .doc { max-width: 720px; margin: 0 auto; padding: 32px 20px 60px; color: #1e293b; font-size: 0.92rem; line-height: 1.7; }
        h1 { font-size: 1.4rem; font-weight: 900; margin: 0 0 4px; }
        .meta { color: #64748b; font-size: 0.8rem; margin: 0 0 18px; }
        .lead { background: #f8fafc; border-radius: 10px; padding: 14px 16px; color: #334155; }
        h2 { font-size: 1rem; font-weight: 800; margin: 22px 0 6px; }
        ul { margin: 6px 0; padding-left: 18px; }
        li { margin-bottom: 4px; }
        .foot { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; }
        a { color: #4f46e5; }
      `}</style>
    </>
  );
}
