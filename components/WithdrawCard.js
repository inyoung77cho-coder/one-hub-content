// [S31-4/5] 인출 계획 카드 — 인출기 사용자용. "이 돈으로 몇 년" · 생활비 커버율.
//   ★순수 산수(withdrawPlan). 가정을 결과와 같은 크기로 밝힌다. 4%룰은 참고선(권유 아님).
//   배당·이자는 사용자가 넣은 값만(추정 안 함). 매일 조치를 요구하지 않는다 — 주기는 월간.
import { useEffect, useState } from "react";
import { getWithdrawInputs, setWithdrawInputs, computeWithdrawPlan, WITHDRAW_RULE_PCT } from "../lib/withdrawPlan";

export default function WithdrawCard({ operatingUk }) {
  const [inp, setInp] = useState({ expense: "", pension: "", dividend: "" });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const w = getWithdrawInputs();
    setInp({ expense: w.expense ?? "", pension: w.pension ?? "", dividend: w.dividend ?? "" });
    if (!(Number(w.expense) > 0)) setOpen(true); // 생활비 미입력이면 입력창 먼저
  }, []);

  const save = (patch) => {
    const next = { ...inp, ...patch };
    setInp(next);
    setWithdrawInputs({
      expense: Number(next.expense) || 0,
      pension: Number(next.pension) || 0,
      dividend: Number(next.dividend) || 0,
    });
  };

  const plan = computeWithdrawPlan({
    operatingUk,
    monthlyExpense: Number(inp.expense) || 0,
    monthlyPension: Number(inp.pension) || 0,
    monthlyDividend: Number(inp.dividend) || 0,
  });
  const hasExpense = Number(inp.expense) > 0;

  return (
    <section className="wd">
      <div className="wd-h">🧮 이번 달 인출 계획 <span className="wd-sub">인출기 · 월 단위</span></div>

      {hasExpense ? (
        <>
          <div className="wd-flow">
            목표 생활비 <b>{plan.expManwon.toLocaleString()}만원</b>
            {" · "}연금·배당 <b>{plan.coverManwon.toLocaleString()}만원</b>
            {plan.coverRate != null && <span className="wd-cover"> (커버율 {plan.coverRate}%)</span>}
          </div>
          <div className="wd-kpis">
            <div className="wd-kpi"><span>자산에서 월 인출</span><b>{plan.needMonthlyManwon.toLocaleString()}만원</b></div>
            <div className="wd-kpi"><span>연 인출률</span><b className={plan.ruleOk === false ? "warn" : ""}>{plan.withdrawRate == null ? "–" : `${plan.withdrawRate}%`}</b></div>
            <div className="wd-kpi"><span>지속 연수(0% 가정)</span><b>{plan.years == null ? "자산 소진 안 함" : `약 ${plan.years}년`}</b></div>
          </div>
          {plan.withdrawRate != null && (
            <div className={`wd-rule ${plan.ruleOk ? "ok" : "warn"}`}>
              {plan.ruleOk
                ? `연 인출률이 ${WITHDRAW_RULE_PCT}% 이하입니다 · 연 ${WITHDRAW_RULE_PCT}% 이하를 권장하는 견해가 있습니다`
                : `연 인출률이 ${WITHDRAW_RULE_PCT}%를 넘습니다 · 연 ${WITHDRAW_RULE_PCT}% 이하를 권장하는 견해가 있습니다`}
            </div>
          )}
          {!plan.hasDividend && (
            <div className="wd-hint">배당 정보를 넣으면 커버율에 반영됩니다.</div>
          )}
          <button type="button" className="wd-edit" onClick={() => setOpen((o) => !o)}>{open ? "입력 닫기" : "생활비·연금·배당 수정"}</button>
        </>
      ) : (
        <div className="wd-empty">월 생활비를 넣으면 <b>이 돈으로 몇 년</b>을 쓸 수 있는지 계산해 드립니다.</div>
      )}

      {(open || !hasExpense) && (
        <div className="wd-inputs">
          <label>월 목표 생활비<input type="number" inputMode="numeric" value={inp.expense} onChange={(e) => save({ expense: e.target.value })} placeholder="만원" /></label>
          <label>연금 월 수령<input type="number" inputMode="numeric" value={inp.pension} onChange={(e) => save({ pension: e.target.value })} placeholder="만원" /></label>
          <label>배당·이자 월액<input type="number" inputMode="numeric" value={inp.dividend} onChange={(e) => save({ dividend: e.target.value })} placeholder="만원(선택)" /></label>
          <div className="wd-pnote">연금은 국민연금공단 예상 수령액을 직접 넣어 주세요. 배당은 넣은 값만 반영(추정 안 함).</div>
        </div>
      )}

      <div className="wd-assume">
        시장 수익률 0%·물가 상승 미반영 기준입니다. 실제로는 수익과 물가에 따라 달라집니다.
      </div>

      <style jsx>{`
        .wd { background: var(--color-card); border: 1px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .wd-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: baseline; gap: 7px; }
        .wd-sub { font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); }
        .wd-flow { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; margin-bottom: 12px; word-break: keep-all; }
        .wd-flow b { color: var(--color-ink); font-weight: 800; }
        .wd-cover { color: var(--color-primary); font-weight: 700; }
        .wd-kpis { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .wd-kpi { background: var(--color-card-soft); border-radius: var(--radius-md); padding: 10px; text-align: center; }
        .wd-kpi span { display: block; font-size: var(--fs-1); color: var(--color-ink-3); margin-bottom: 4px; word-break: keep-all; }
        .wd-kpi b { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); }
        .wd-kpi b.warn { color: var(--color-danger, #dc2626); }
        .wd-rule { margin-top: 10px; font-size: var(--fs-2); border-radius: var(--radius-sm); padding: 8px 11px; word-break: keep-all; line-height: 1.5; }
        .wd-rule.ok { background: var(--color-primary-soft); color: var(--color-ink-2); }
        .wd-rule.warn { background: var(--color-warning-soft, var(--color-card-soft)); color: var(--color-warning-ink, var(--color-warning)); }
        .wd-hint { margin-top: 8px; font-size: var(--fs-1); color: var(--color-ink-3); }
        .wd-edit { margin-top: 10px; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 8px 12px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .wd-empty { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .wd-empty b { color: var(--color-ink); }
        .wd-inputs { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
        .wd-inputs label { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: var(--fs-2); font-weight: 700; color: var(--color-ink-2); }
        .wd-inputs input { width: 130px; border: 1px solid var(--color-line); border-radius: 8px; padding: 8px 10px; font-size: var(--fs-3); font-family: inherit; background: var(--color-card); color: var(--color-ink); text-align: right; }
        .wd-pnote { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .wd-assume { margin-top: 12px; font-size: var(--fs-2); font-weight: 700; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft, var(--color-card-soft)); border-radius: var(--radius-sm); padding: 10px 12px; line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
