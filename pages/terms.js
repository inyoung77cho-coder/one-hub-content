// pages/terms.js — PP-1 이용약관(베타 최소본). 정식 공개(P3) 시 개정.
import Head from "next/head";
import Link from "next/link";

const UPDATED = "2026-07-25";

export default function Terms() {
  return (
    <>
      <Head>
        <title>이용약관 · ONE·HUB</title>
        <meta name="robots" content="noindex" />
      </Head>
      <main className="doc">
        <h1>이용약관</h1>
        <p className="meta">ONE·HUB · 시행일 {UPDATED} · <b>베타(시험) 서비스</b></p>

        <h2>제1조 (목적)</h2>
        <p>본 약관은 ONE·HUB(이하 “서비스”)의 이용 조건과 이용자·운영자의 권리·의무를 정합니다.</p>

        <h2>제2조 (서비스의 성격 · 베타 고지)</h2>
        <ul>
          <li>본 서비스는 <b>개발 중인 시험(베타) 서비스</b>로, 기능·데이터가 불완전하거나 변경·중단될 수 있습니다.</li>
          <li>화면의 수치·분석·AI 판단은 <b>참고용</b>이며, <b>투자자문·매매 권유가 아닙니다.</b> 모든 투자 판단과 책임은 이용자 본인에게 있습니다.</li>
          <li>게임·모의(나 vs AI 등)는 가상 머니 기반이며 실제 주문·거래가 아닙니다.</li>
        </ul>

        <h2>제3조 (회원가입 · 계정)</h2>
        <p>카카오 로그인으로 가입하며, 이용자는 계정 정보를 스스로 관리할 책임이 있습니다.</p>

        <h2>제4조 (베타 테스터 · 요금)</h2>
        <p>시험 단계 참여자는 무료로 이용하며, 정식 출시 후에도 무료 이용 자격(평생무료)을 제공합니다. 유료 기능 도입 시 사전 고지합니다.</p>

        <h2>제5조 (이용자의 의무)</h2>
        <ul>
          <li>타인의 계정·데이터에 무단 접근하거나 서비스를 방해하지 않습니다.</li>
          <li>입력하는 정보에 대한 정확성·적법성은 이용자에게 있습니다.</li>
        </ul>

        <h2>제6조 (책임의 한계 · 투자 면책)</h2>
        <p>운영자는 베타 서비스의 정확성·완전성·연속성을 보증하지 않으며, 서비스 이용 또는 투자 판단으로 인한 손해에 대해 관련 법령이 허용하는 범위에서 책임을 지지 않습니다. 투자 관련 유의사항은 <Link href="/disclaimer">투자 유의사항·면책 고지</Link>를 따릅니다.</p>

        <h2>제7조 (서비스의 변경 · 중단)</h2>
        <p>운영자는 서비스의 전부 또는 일부를 변경·중단할 수 있으며, 베타 단계에서는 사전 고지 없이 데이터가 초기화되거나 기능이 조정될 수 있습니다. 중대한 변경은 가능한 범위에서 사전 고지합니다.</p>

        <h2>제8조 (개인정보)</h2>
        <p>개인정보의 처리는 <Link href="/privacy">개인정보 처리방침</Link>에 따릅니다.</p>

        <h2>제9조 (약관의 변경)</h2>
        <p>운영자는 필요 시 약관을 변경할 수 있으며, 변경 시 시행일과 내용을 서비스 내 고지합니다. 변경 후 계속 이용하는 경우 변경 약관에 동의한 것으로 봅니다.</p>

        <h2>제10조 (준거법 · 분쟁 해결)</h2>
        <p>본 약관은 대한민국 법령에 따라 해석되며, 서비스 이용과 관련한 분쟁은 관련 법령이 정한 절차와 관할 법원에 따릅니다.</p>

        <p className="foot"><Link href="/privacy">개인정보 처리방침</Link> · <Link href="/disclaimer">투자 유의·면책</Link> · <Link href="/">홈으로</Link></p>
      </main>
      <style jsx>{`
        .doc { max-width: 720px; margin: 0 auto; padding: 32px 20px 60px; color: #1e293b; font-size: 0.92rem; line-height: 1.7; }
        h1 { font-size: 1.4rem; font-weight: 900; margin: 0 0 4px; }
        .meta { color: #64748b; font-size: 0.8rem; margin: 0 0 18px; }
        h2 { font-size: 1rem; font-weight: 800; margin: 22px 0 6px; }
        ul { margin: 6px 0; padding-left: 18px; }
        li { margin-bottom: 4px; }
        .foot { margin-top: 30px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 0.85rem; }
        a { color: #4f46e5; }
      `}</style>
    </>
  );
}
