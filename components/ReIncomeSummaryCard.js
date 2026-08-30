// components/ReIncomeSummaryCard.js — [시나리오 탭] 보유 부동산 수익 요약 (읽기 전용)
//   기존 realestate.js 계산값을 그대로 받아 요약 표시. 평가손익은 대표 단지 기준만
//   (추가 부동산은 매수가 미입력이라 평가·임대수익만 집계).
const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);

export default function ReIncomeSummaryCard({
  totalEvalUk = null,
  totalPnlUk = null,       // 전체 평가손익(대표 + 매수가 입력된 추가 부동산)
  totalPnlPct = null,
  pnlScope = "none",       // "all"(대표+추가) | "rep"(대표만) | "none"
  totalDepositUk = null,
  totalMonthly = null,
  totalNetUk = null,
}) {
  // 연 환산 수익률 = (월수익×12 / 만원→억) / 순수투자금 × 100 — 임대수익 있을 때만.
  const hasRental = totalMonthly != null && Number(totalMonthly) > 0;
  const annualYieldPct = (hasRental && totalNetUk != null && Number(totalNetUk) > 0)
    ? ((Number(totalMonthly) * 12 / 10000) / Number(totalNetUk)) * 100
    : null;

  // 표시할 값이 하나도 없으면 카드 자체를 숨김.
  if (totalEvalUk == null && totalPnlUk == null && totalDepositUk == null && !hasRental && totalNetUk == null) {
    return null;
  }
  const pnlLabel = pnlScope === "all" ? "전체 평가손익" : "대표 단지 평가손익";

  return (
    <section className="ris-card">
      <span className="ris-label">보유 수익 요약</span>
      <h2 className="ris-title">💰 내 부동산 수익 <span className="ris-mini">평가 + 임대</span></h2>

      <div className="ris-rows">
        {totalEvalUk != null && (
          <div className="ris-row"><span>총 평가금액</span><b>{uk(totalEvalUk)}</b></div>
        )}
        {totalPnlUk != null && (
          <div className={`ris-row ${totalPnlUk >= 0 ? "pos" : "neg"}`}>
            <span>{pnlLabel} <em>추정</em></span>
            <b>{totalPnlUk >= 0 ? "+" : ""}{uk(totalPnlUk)}{totalPnlPct != null ? ` · ${pct(totalPnlPct)}` : ""}</b>
          </div>
        )}
        {totalDepositUk != null && Number(totalDepositUk) > 0 && (
          <div className="ris-row"><span>총 보증금</span><b>{uk(totalDepositUk)}</b></div>
        )}
        {hasRental && (
          <div className="ris-row"><span>총 월 임대수익</span><b>{Number(totalMonthly).toLocaleString()}만원</b></div>
        )}
        {totalNetUk != null && (
          <div className="ris-row"><span>순수투자금 <em>평가−보증금</em></span><b>{uk(totalNetUk)}</b></div>
        )}
        {annualYieldPct != null && (
          <div className="ris-row hl"><span>연 환산 수익률 <em>월세 기준</em></span><b>{pct(annualYieldPct)}</b></div>
        )}
      </div>

      <p className="ris-note">
        평가손익은 <b>매수가가 입력된 부동산</b>만 합산합니다(대표 + 추가). 매수가를 안 넣은 항목은
        평가금액·임대수익에만 반영됩니다. 모두 <b>추정</b>이며 확정·투자자문이 아닙니다.
      </p>

      <style jsx>{`
        .ris-card { background: var(--color-card); border-radius: var(--radius-card, 16px); padding: 16px 15px 15px; box-shadow: var(--shadow-card); border: 1px solid var(--color-line); margin-bottom: 12px; }
        .ris-label { display: block; font-size: 0.68rem; font-weight: 800; color: var(--color-ink-3); letter-spacing: .3px; text-transform: uppercase; margin-bottom: 2px; }
        .ris-title { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); margin: 0 0 12px; }
        .ris-mini { font-size: 0.62rem; font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft); border-radius: 999px; padding: 1px 7px; margin-left: 5px; vertical-align: middle; }
        .ris-rows { display: flex; flex-direction: column; gap: 2px; }
        .ris-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--color-line); }
        .ris-row:last-child { border-bottom: none; }
        .ris-row span { font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); word-break: keep-all; }
        .ris-row em { font-style: normal; font-size: 0.56rem; font-weight: 800; background: var(--color-warning-soft); color: var(--color-warning-ink, var(--color-warning)); padding: 1px 5px; border-radius: 4px; margin-left: 5px; vertical-align: middle; }
        .ris-row b { font-size: 0.98rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; white-space: nowrap; }
        .ris-row.pos b { color: var(--color-success); }
        .ris-row.neg b { color: var(--color-danger); }
        .ris-row.hl { background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; border-bottom: none; margin-top: 4px; }
        .ris-row.hl b { color: var(--color-primary); }
        .ris-note { font-size: 0.64rem; color: var(--color-ink-3); margin: 11px 0 0; line-height: 1.55; word-break: keep-all; }
        .ris-note b { color: var(--color-ink-2); font-weight: 700; }
      `}</style>
    </section>
  );
}
