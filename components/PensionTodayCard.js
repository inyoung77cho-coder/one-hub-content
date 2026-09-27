// [S20-PEN E-3] 오늘 페이지 연금 카드 — 오늘 할 일(액션) 요약 + /pwa/pension 딥링크.
//   ?focus=pension 으로 들어오면 이 카드로 스크롤·강조. 연금 계좌가 없으면 렌더 안 함(클러터 금지).
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/router";
import * as P from "../lib/pension";

export default function PensionTodayCard() {
  const router = useRouter();
  const [rows, setRows] = useState(null); // [{account, label, type, pending, first}]
  const [flash, setFlash] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ar = await P.getAccounts();
      if (!alive || !ar.data?.ok || !ar.data.accounts?.length) { setRows([]); return; }
      const out = [];
      for (const a of ar.data.accounts) {
        const act = await P.getActions(a.account_id);
        const list = (act.data?.ok ? act.data.actions : []) || [];
        const pending = list.filter((x) => x.status === "PENDING" && x.action_type !== "CHECK" && x.action_type !== "REVIEW");
        out.push({
          account: a.account_id, label: a.label, type: a.account_type,
          total: list.length, pending: pending.length,
          first: (pending[0] || list[0]) || null,
        });
      }
      if (alive) setRows(out);
    })();
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    if (router.query.focus === "pension" && ref.current) {
      ref.current.scrollIntoView({ behavior: "smooth", block: "center" });
      setFlash(true);
      const t = setTimeout(() => setFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [router.query.focus, rows]);

  if (!rows || rows.length === 0) return null; // 연금 계좌가 있을 때만(비-연금 사용자엔 안 뜸)
  const totalPending = rows.reduce((s, r) => s + r.pending, 0);

  const summarize = (a) => {
    const f = a.first;
    if (!f) return "예정된 매매 없음";
    const t = { SELL: "매도", BUY: "매수", REDEEM: "환매", CHECK: "점검", REVIEW: "리뷰", SETTING: "설정", HOLD: "보류" }[f.action_type] || f.action_type;
    const q = f.qty ? `${f.qty}주` : (f.amount ? `${Math.round(f.amount / 1e4).toLocaleString()}만원` : "");
    return `${f.name || ""} ${t} ${q}`.trim();
  };

  return (
    <div ref={ref} className={`ptc ${flash ? "flash" : ""}`}
      onClick={() => router.push("/pwa/pension")} role="button">
      <div className="ptc-head">
        <span className="ptc-ic">🏦</span>
        <b>연금 오늘 할 일</b>
        {totalPending > 0 ? <span className="ptc-badge">{totalPending}건</span> : <span className="ptc-badge quiet">점검일</span>}
        <span className="ptc-go">›</span>
      </div>
      {rows.map((a) => (
        <div key={a.account} className="ptc-row">
          <span className="ptc-lbl">{a.label}</span>
          <span className="ptc-sum">{summarize(a)}</span>
        </div>
      ))}
      <style jsx>{`
        .ptc { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius, 12px);
          padding: 12px 14px; margin-bottom: 12px; cursor: pointer; transition: box-shadow .3s, border-color .3s; }
        .ptc.flash { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-weak, rgba(67,56,202,0.15)); }
        .ptc-head { display: flex; align-items: center; gap: 8px; }
        .ptc-head b { font-size: var(--fs-2, 15px); }
        .ptc-ic { font-size: 18px; }
        .ptc-badge { font-size: var(--fs-0, 11px); font-weight: 700; color: var(--color-on-primary, #fff);
          background: var(--color-primary); border-radius: 10px; padding: 2px 8px; }
        .ptc-badge.quiet { background: var(--color-border); color: var(--color-muted); }
        .ptc-go { margin-left: auto; color: var(--color-muted); font-size: 20px; }
        .ptc-row { display: flex; gap: 10px; margin-top: 6px; font-size: var(--fs-1, 13px); }
        .ptc-lbl { color: var(--color-muted); min-width: 56px; }
        .ptc-sum { color: var(--color-ink); word-break: keep-all; }
      `}</style>
    </div>
  );
}
