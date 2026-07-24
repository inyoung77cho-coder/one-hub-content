// pages/disclaimer.js — 투자 유의/면책 고지(§8 invest_disclaimer 동의 대상 문서).
import Head from "next/head";

export default function Disclaimer() {
  return (
    <>
      <Head><title>투자 유의사항 · 면책 고지 | ONE-HUB</title></Head>
      <main className="lg-wrap">
        <h1>투자 유의사항 · 면책 고지</h1>
        <p className="lg-date">최종 개정일 2026-07-24</p>

        <h2>1. 정보 제공의 성격</h2>
        <p>ONE-HUB가 제공하는 모든 정보(AI 분석·점수·추천·리포트·시세·부동산 정보 등)는
        <b> 일반적인 참고용 정보</b>이며, 특정 종목·부동산의 매수·매도·보유를 권유하는
        <b> 투자자문·투자일임·금융투자중개가 아닙니다.</b> ONE-HUB는 자본시장법상 투자자문업자가 아닙니다.</p>

        <h2>2. 투자 판단과 책임</h2>
        <p>모든 투자·매매·거래의 <b>최종 판단과 책임은 이용자 본인</b>에게 있습니다. 과거의
        수익률·백테스트·시뮬레이션 결과는 미래 수익을 보장하지 않으며, 원금 손실이 발생할 수 있습니다.
        AI의 판단은 오류가 있을 수 있고, 시장 상황에 따라 결과가 달라집니다.</p>

        <h2>3. 데이터의 정확성</h2>
        <p>시세·실거래가·환율 등은 공개 소스에서 수집되며 지연·오류가 있을 수 있습니다. 카톡방 등에서
        수집한 부동산 정보는 <b>국토부 실거래로 확인되지 않은 미검증 참고 정보</b>입니다. 거래 전 반드시
        현장·서류·공적 자료로 직접 확인하시기 바랍니다.</p>

        <h2>4. 세무·법률</h2>
        <p>양도세·배당세 등 세금 관련 계산은 참고용 추정이며 <b>세무자문이 아닙니다.</b> 실제 신고·납부
        세액은 개인의 소득·공제·거래 내역과 현행 세법에 따라 달라지므로 세무 전문가와 확인하십시오.</p>

        <h2>5. 책임의 제한</h2>
        <p>이용자가 본 서비스의 정보를 신뢰하여 내린 판단으로 발생한 손실에 대해 ONE-HUB는 관련 법령이
        허용하는 범위에서 책임을 지지 않습니다.</p>

        <p className="lg-foot">본 고지는 이용약관·개인정보 처리방침과 함께 서비스 이용의 전제가 됩니다.</p>
      </main>
      <style jsx>{`
        .lg-wrap { max-width: 760px; margin: 0 auto; padding: 32px 20px 64px; font-family: 'Pretendard', sans-serif; color: #26364F; line-height: 1.7; }
        h1 { font-size: 1.5rem; font-weight: 800; color: #12213B; margin-bottom: 4px; }
        .lg-date { font-size: 0.8rem; color: #94A3B8; margin-bottom: 24px; }
        h2 { font-size: 1.05rem; font-weight: 800; color: #12213B; margin: 24px 0 8px; }
        p { font-size: 0.92rem; margin: 0 0 10px; }
        .lg-foot { margin-top: 28px; font-size: 0.82rem; color: #64748B; }
      `}</style>
    </>
  );
}
