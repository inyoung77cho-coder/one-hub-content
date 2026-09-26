// [S20-PEN] 연금(개인연금·퇴직연금 DC) 화면 — 단일 소스(snapshot/latest) + 진단·위험게이지·오늘할일·가구.
//   반자동: 엔진이 '오늘 할 일'을 만들고, 사용자가 MTS 체결 후 [완료]. 자동주문 없음.
//   E-5: CSS 변수 전용(하드코딩 색상 0)·380px·로딩 스켈레톤.
import { useState, useEffect, useCallback } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import * as P from "../../lib/pension";

const won = (v) => (v == null ? "-" : Math.round(Number(v)).toLocaleString());
const man = (v) => (v == null ? "-" : `${Math.round(Number(v) / 1e4).toLocaleString()}만`);
const pct = (v, d = 2) => (v == null ? "-" : `${Number(v).toFixed(d)}%`);

const ACCOUNTS = [
  { id: "A-PEN-01", label: "개인연금", type: "PENSION_SAVINGS" },
  { id: "A-DC-01", label: "퇴직연금", type: "DC" },
];

export default function PensionPage() {
  const [acct, setAcct] = useState(ACCOUNTS[0]);
  const [snap, setSnap] = useState(null);
  const [risk, setRisk] = useState(null);
  const [cards, setCards] = useState(null);
  const [actions, setActions] = useState(null);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, c, a] = await Promise.all([
      P.getSnapshot(acct.id), P.getDiagnose(acct.id), P.getActions(acct.id),
    ]);
    setSnap(s.data?.ok ? s.data.snapshot : null);
    setCards(c.data?.ok ? c.data.cards : []);
    setActions(a.data?.ok ? a.data.actions : []);
    if (acct.type === "DC") {
      const r = await P.getRisk(acct.id);
      setRisk(r.data?.ok ? r.data : null);
    } else setRisk(null);
    const h = await P.getHousehold("HH-A");
    setHousehold(h.data?.ok ? h.data : null);
    setLoading(false);
  }, [acct]);

  useEffect(() => { load(); }, [load]);

  const doPreview = async () => {
    setMsg("");
    const r = await P.pastePreview(acct.id, pasteText);
    if (r.data?.ok) setPreview(r.data);
    else { setPreview(null); setMsg(r.data?.error || "미리보기 실패"); }
  };
  const doSave = async () => {
    const r = await P.pasteSave(acct.id, pasteText);
    if (r.data?.ok) { setMsg("저장됨"); setPasteOpen(false); setPasteText(""); setPreview(null); load(); }
    else setMsg(r.data?.error || "저장 실패");
  };
  const complete = async (id) => {
    const r = await P.setActionStatus(id, { status: "DONE" });
    if (r.data?.ok) load();
  };

  return (
    <div className="pen-wrap">
      <AppHeader />
      <main className="pen-main">
        <h1 className="pen-title">🏦 연금 <span className="pen-unit">단위: 원</span></h1>

        <div className="pen-tabs" role="tablist">
          {ACCOUNTS.map((a) => (
            <button key={a.id} role="tab" aria-selected={acct.id === a.id}
              className={acct.id === a.id ? "on" : ""} onClick={() => setAcct(a)}>{a.label}</button>
          ))}
        </div>

        {loading ? (
          <div className="pen-skel" aria-busy="true">불러오는 중…</div>
        ) : !snap ? (
          <section className="pen-card pen-empty">
            <p>아직 <b>{acct.label}</b> 스냅샷이 없습니다. 증권사 화면을 붙여넣어 시작하세요.</p>
            <button className="pen-btn" onClick={() => setPasteOpen(true)}>증권사 화면 붙여넣기</button>
          </section>
        ) : (
          <>
            {/* 요약 밴드 */}
            <section className="pen-card pen-summary">
              <div className="pen-total">{man(snap.total_value)}<span>원</span></div>
              <div className="pen-rets">
                <span>누적 {pct(snap.ret_cum_pct)}</span>
                <span>연평균 {pct(snap.ret_annual_pct)}</span>
                <span>올해 {pct(snap.ret_ytd_pct)}</span>
              </div>
              <div className="pen-asof">기준일 {snap.base_date || snap.as_of} · 출처 {snap.source}</div>
            </section>

            {/* 위험자산 게이지(DC) */}
            {risk && (
              <section className="pen-card">
                <h2>위험자산 한도</h2>
                <RiskGauge risk={risk} total={snap.total_value} />
                <div className="pen-hint">법정 70% · 운영 {Math.round((risk.cap_operating || 0.6) * 100)}% · 여유 {man(risk.headroom_legal)}원</div>
                {risk.mismatch && <p className="pen-warn">⚠ 상품 분류가 화면값과 어긋나 계획을 활성화하지 않습니다.</p>}
              </section>
            )}

            {/* 오늘 할 일 */}
            <section className="pen-card">
              <h2>오늘 할 일</h2>
              {actions && actions.length ? actions.map((a) => (
                <div key={a.action_id} className="pen-todo">
                  <div className="pen-todo-main">
                    <b>{a.action_type}</b> {a.name || ""} {a.qty ? `${a.qty}주` : (a.amount ? man(a.amount) + "원" : "")}
                    {a.reason && <div className="pen-todo-why">{a.reason}</div>}
                  </div>
                  {a.status === "PENDING" && a.action_type !== "CHECK" && a.action_type !== "REVIEW" && (
                    <button className="pen-btn sm" onClick={() => complete(a.action_id)}>완료</button>
                  )}
                  {a.status !== "PENDING" && <span className="pen-badge">{a.status}</span>}
                </div>
              )) : <p className="pen-muted">오늘은 예정된 매매가 없습니다.</p>}
            </section>

            {/* 진단 카드 */}
            <section className="pen-card">
              <h2>진단</h2>
              {cards && cards.length ? cards.map((c, i) => (
                <div key={i} className="pen-diag" style={{ borderLeftColor: P.SEV_COLOR[c.severity] }}>
                  <div className="pen-diag-h"><b>{c.title}</b><span className="pen-sev" style={{ color: P.SEV_COLOR[c.severity] }}>{c.severity}</span></div>
                  <div className="pen-diag-v">{c.value_label}</div>
                  {c.why && <div className="pen-muted">{c.why}</div>}
                </div>
              )) : <p className="pen-muted">진단할 데이터가 없습니다.</p>}
            </section>
          </>
        )}

        {/* 가구 요약 */}
        {household && (
          <section className="pen-card pen-house">
            <h2>가구 합산</h2>
            <div className="pen-total sm">{man(household.total_value)}<span>원</span></div>
            <div className="pen-muted">기준일 {household.base_date || "-"}</div>
            {(household.cards || []).slice(0, 3).map((c, i) => (
              <div key={i} className="pen-hcard"><span style={{ color: P.SEV_COLOR[c.severity] }}>●</span> {c.title} · {c.value_label}</div>
            ))}
          </section>
        )}

        <button className="pen-btn wide" onClick={() => setPasteOpen(true)}>증권사 화면 붙여넣기</button>
        {msg && <div className="pen-msg">{msg}</div>}

        {pasteOpen && (
          <div className="pen-sheet" role="dialog">
            <div className="pen-sheet-in">
              <h3>{acct.label} 화면 붙여넣기</h3>
              <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={6}
                placeholder="MTS 자산현황 화면을 복사해 붙여넣으세요" />
              {preview && (
                <div className="pen-prev">
                  <div>총자산 {man(preview.total_value)}원 · 보유 {preview.holdings}종</div>
                  {preview.unmatched?.length > 0 && <div className="pen-warn">미등록 {preview.unmatched.length}종: {preview.unmatched.join(", ")}</div>}
                  <div className="pen-muted">합계 검증 {preview.verify?.ok ? "통과" : "실패"}</div>
                </div>
              )}
              <div className="pen-sheet-btns">
                <button className="pen-btn ghost" onClick={() => { setPasteOpen(false); setPreview(null); }}>닫기</button>
                <button className="pen-btn ghost" onClick={doPreview}>미리보기</button>
                <button className="pen-btn" onClick={doSave} disabled={!preview?.verify?.ok}>저장</button>
              </div>
            </div>
          </div>
        )}

        <p className="pen-disc">⚠ 투자자문·세무자문이 아닙니다. 매매·실행 판단은 본인이 합니다.</p>
      </main>
      <BottomNav />

      <style jsx>{`
        .pen-wrap { min-height: 100vh; background: var(--color-bg); color: var(--color-ink); padding-bottom: 72px; }
        .pen-main { max-width: 560px; margin: 0 auto; padding: 12px 16px; }
        .pen-title { font-size: var(--fs-5, 20px); margin: 8px 0 12px; display: flex; align-items: baseline; gap: 8px; }
        .pen-unit { font-size: var(--fs-1, 12px); color: var(--color-muted); }
        .pen-tabs { display: flex; gap: 8px; margin-bottom: 12px; }
        .pen-tabs button { flex: 1; padding: 10px; border: 1px solid var(--color-border); border-radius: var(--radius, 10px);
          background: var(--color-surface); color: var(--color-ink); font-weight: 600; min-width: 0; }
        .pen-tabs button.on { background: var(--color-primary); color: var(--color-on-primary, #fff); border-color: var(--color-primary); }
        .pen-card { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: var(--radius, 12px);
          padding: 14px; margin-bottom: 12px; }
        .pen-card h2 { font-size: var(--fs-2, 14px); margin: 0 0 10px; color: var(--color-muted); }
        .pen-total { font-size: var(--fs-6, 28px); font-weight: 800; }
        .pen-total.sm { font-size: var(--fs-4, 20px); }
        .pen-total span { font-size: var(--fs-2, 14px); color: var(--color-muted); margin-left: 4px; }
        .pen-rets { display: flex; gap: 12px; flex-wrap: wrap; margin: 6px 0; color: var(--color-ink-2, var(--color-ink)); font-size: var(--fs-2, 14px); }
        .pen-asof, .pen-hint, .pen-muted { font-size: var(--fs-1, 12px); color: var(--color-muted); }
        .pen-warn { color: var(--color-warning); font-size: var(--fs-1, 12px); margin-top: 6px; }
        .pen-todo { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-top: 1px solid var(--color-border); }
        .pen-todo:first-of-type { border-top: none; }
        .pen-todo-main { flex: 1; min-width: 0; }
        .pen-todo-why { font-size: var(--fs-1, 12px); color: var(--color-muted); word-break: keep-all; }
        .pen-badge { font-size: var(--fs-0, 11px); color: var(--color-muted); border: 1px solid var(--color-border); border-radius: 6px; padding: 2px 6px; }
        .pen-diag { border-left: 3px solid var(--color-border); padding: 6px 0 6px 10px; margin-bottom: 8px; }
        .pen-diag-h { display: flex; justify-content: space-between; align-items: baseline; }
        .pen-sev { font-size: var(--fs-0, 11px); font-weight: 700; }
        .pen-diag-v { font-size: var(--fs-2, 14px); margin: 2px 0; }
        .pen-hcard { font-size: var(--fs-2, 13px); margin-top: 6px; }
        .pen-btn { background: var(--color-primary); color: var(--color-on-primary, #fff); border: none; border-radius: var(--radius, 10px);
          padding: 10px 14px; font-weight: 700; }
        .pen-btn.sm { padding: 6px 10px; font-size: var(--fs-1, 12px); }
        .pen-btn.wide { width: 100%; margin: 4px 0 10px; }
        .pen-btn.ghost { background: var(--color-surface); color: var(--color-ink); border: 1px solid var(--color-border); }
        .pen-btn:disabled { opacity: 0.5; }
        .pen-empty { text-align: center; }
        .pen-skel { padding: 40px; text-align: center; color: var(--color-muted); }
        .pen-msg { text-align: center; color: var(--color-primary); font-size: var(--fs-1, 12px); margin-bottom: 8px; }
        .pen-sheet { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; z-index: 50; }
        .pen-sheet-in { background: var(--color-surface); width: 100%; max-width: 560px; margin: 0 auto; border-radius: 16px 16px 0 0; padding: 16px; }
        .pen-sheet-in textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-border); border-radius: 8px; padding: 8px; background: var(--color-bg); color: var(--color-ink); }
        .pen-sheet-btns { display: flex; gap: 8px; margin-top: 10px; }
        .pen-sheet-btns .pen-btn { flex: 1; }
        .pen-prev { margin-top: 8px; font-size: var(--fs-2, 13px); }
        .pen-disc { font-size: var(--fs-0, 11px); color: var(--color-muted); text-align: center; margin: 16px 0; word-break: keep-all; }
      `}</style>
    </div>
  );
}

function RiskGauge({ risk, total }) {
  const ratio = risk.risky_ratio || 0;
  const cap = risk.cap_operating || 0.6;
  const pctW = Math.min(100, ratio * 100);
  return (
    <div className="rg">
      <div className="rg-bar">
        <div className="rg-fill" style={{ width: `${pctW}%`, background: ratio > cap ? "var(--color-warning)" : "var(--color-primary)" }} />
        <div className="rg-mark op" style={{ left: `${cap * 100}%` }} title="운영 상한" />
        <div className="rg-mark legal" style={{ left: "70%" }} title="법정 70%" />
      </div>
      <div className="rg-lbl">현재 위험자산 <b>{(ratio * 100).toFixed(2)}%</b></div>
      <style jsx>{`
        .rg-bar { position: relative; height: 16px; background: var(--color-border); border-radius: 8px; overflow: hidden; }
        .rg-fill { height: 100%; }
        .rg-mark { position: absolute; top: -3px; width: 2px; height: 22px; }
        .rg-mark.op { background: var(--color-ink-3, var(--color-muted)); }
        .rg-mark.legal { background: var(--color-danger, var(--color-warning)); }
        .rg-lbl { font-size: var(--fs-2, 13px); margin-top: 6px; }
      `}</style>
    </div>
  );
}
