// [S19-3 사용자 지시 2026-08-30] "KIS 보유 종목" 카드 — 종합자산 › 주식 › 보유 탭에서
//   페이지를 옮기지 않고 바로 상세를 보고 매도까지 하도록, 기존 /pwa?tab=portfolio 의
//   보유 카드를 공용 컴포넌트로 뽑았다.
//   ★ 같은 UI를 두 페이지에 손으로 복제하면 반드시 어긋난다(CLAUDE.md header_position_consistency).
//     그래서 assets.js 와 index.js(portfolio 탭)가 이 파일 하나를 함께 쓴다.
//   ★ 매도 확인은 window.confirm/alert 을 쓰지 않는다 — 모달이 뜨면 PWA 이벤트가 막히고,
//     결과를 카드 안에서 보여주는 편이 "무슨 일이 일어났나"가 더 분명하다.
import { useState } from "react";

const n = (x) => (x == null || isNaN(Number(x)) ? null : Number(x));
const won = (v) => `${Math.round(Number(v) || 0).toLocaleString()}원`;
const safeNum = (v) => (v == null || isNaN(Number(v)) ? 0 : Number(v));

// AI 스탠스(유지/추가/축소/매도) + 근거 1줄 — 목표가/손절가 기반. index.js deriveStance 와 동일 규칙.
export function deriveStance(p) {
  const cur = n(p.current_price) ?? 0, avg = n(p.avg_price) ?? 0, tgt = n(p.target) ?? 0, stp = n(p.stop_loss) ?? 0;
  const pnl = p.pnl_rate ?? 0;
  const upside = tgt > 0 && cur > 0 ? (tgt / cur - 1) * 100 : null;
  if (tgt > 0 && cur >= tgt)
    return { label: "축소", color: "var(--color-success)", reason: `목표가 ${won(tgt)} 도달 — 차익 실현(익절) 검토` };
  if (stp > 0 && cur > 0 && cur <= stp)
    return { label: "매도", color: "var(--color-danger)", reason: `손절선 ${won(stp)} 도달 — 리스크 관리 매도 검토` };
  if (pnl >= 5 && (upside == null || upside > 3))
    return { label: "추가", color: "var(--color-primary)", reason: `추세 양호${upside != null ? ` · 목표가까지 +${upside.toFixed(0)}% 여력` : ""}${stp > 0 ? `, 손절선 ${won(stp)} 미접촉` : ""}` };
  if (avg > 0 && cur > 0 && cur < avg * 0.95)
    return { label: "유지", color: "var(--color-warning)", reason: `평단 대비 하락 · ${stp > 0 ? `손절선 ${won(stp)}까지 관찰` : "추세 관찰"}` };
  return { label: "유지", color: "var(--color-ink-2)", reason: `${upside != null ? `목표가 ${won(tgt)}까지 +${upside.toFixed(0)}% 여력` : "추세 관찰 중"}${stp > 0 ? `, 손절선 ${won(stp)} 미접촉` : ""}` };
}

// 보유 액션 긴급도 4단계 — 임계치는 설정값(하드코딩 금지).
const HOLD_URG_CFG = { nearPct: 3, spikePct: 7 };
export function deriveUrgency(p, cfg = HOLD_URG_CFG) {
  const cur = n(p.current_price) ?? 0, tgt = n(p.target) ?? 0, stp = n(p.stop_loss) ?? 0;
  const near = cfg.nearPct / 100;
  const day = n(p.change_1d);
  if (stp > 0 && cur > 0 && cur <= stp * (1 + near))
    return { level: "urgent", rank: 0, badge: "손절 임박", color: "var(--color-danger)", bar: "var(--color-danger)" };
  if (tgt > 0 && cur > 0 && cur >= tgt * (1 - near))
    return { level: "chance", rank: 1, badge: "익절 검토", color: "var(--color-success)", bar: "var(--color-success)" };
  if (day != null && Math.abs(day) >= cfg.spikePct)
    return { level: "watch", rank: 2, badge: "점검 필요", color: "var(--color-warning-ink, var(--color-warning))", bar: "var(--color-warning)" };
  return { level: "normal", rank: 3, badge: "유지", color: "var(--color-ink-3)", bar: null };
}

export default function KisHoldingsCard({ positions = [], trader = "A", title = "KIS 보유 종목", subtitle = "증권사 연동 계좌", onSold }) {
  const [sort, setSort] = useState("urgency");
  const [confirmKey, setConfirmKey] = useState(null);
  const [busyKey, setBusyKey] = useState(null);
  const [result, setResult] = useState({}); // { [key]: { ok, msg } }
  const [openKey, setOpenKey] = useState(null); // 상세 펼침(모바일에서 한 번에 다 펼치면 너무 길다)

  const sorted = sort === "value" ? positions : [...positions].sort((a, b) => deriveUrgency(a).rank - deriveUrgency(b).rank);
  const actionCnt = positions.filter((p) => deriveUrgency(p).rank <= 2).length;

  const sell = async (key, p) => {
    if (confirmKey !== key) {
      setConfirmKey(key);
      setTimeout(() => setConfirmKey((k) => (k === key ? null : k)), 4000);
      return;
    }
    setConfirmKey(null);
    setBusyKey(key);
    try {
      const res = await fetch("/api/pwa/sell", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: p.code, trader }),
      });
      const d = await res.json();
      setResult((r) => ({ ...r, [key]: d.ok
        ? { ok: true, msg: `${p.name} 매도 주문을 자동매매 엔진에 전송했습니다.` }
        : { ok: false, msg: `매도 실패 — ${d.error || "엔진이 주문을 받지 못했습니다"}` } }));
      if (d.ok && onSold) onSold(p);
    } catch (e) {
      setResult((r) => ({ ...r, [key]: { ok: false, msg: `매도 요청 중 오류 — ${e.message}` } }));
    }
    setBusyKey(null);
  };

  return (
    <section className="kh">
      <div className="kh-head">
        <span className="kh-title">💳 {title} <span className="kh-sub">{subtitle}</span></span>
        {positions.length > 1 && (
          <button className="kh-sort" onClick={() => setSort((s) => (s === "urgency" ? "value" : "urgency"))}>
            {sort === "urgency" ? "긴급도순" : "기본순"} ⇅
          </button>
        )}
      </div>

      {positions.length === 0 ? (
        <div className="kh-empty">증권사 연동 계좌에 보유 종목이 없어요.</div>
      ) : (<>
        <div className="kh-summary">
          {actionCnt > 0 ? <>오늘 조치가 필요한 종목 <b>{actionCnt}개</b></> : "오늘은 조치할 종목이 없습니다"}
        </div>

        <div className="kh-list">
          {sorted.map((p, i) => {
            const key = p.code || String(i);
            const u = deriveUrgency(p);
            const st = deriveStance(p);
            const open = openKey === key;
            const cur = safeNum(p.current_price), avg = safeNum(p.avg_price);
            const stop = safeNum(p.stop_loss) > 0 ? safeNum(p.stop_loss) : (avg > 0 ? Math.round(avg * 0.92) : 0);
            const tgt = safeNum(p.target) > 0 ? safeNum(p.target) : (avg > 0 ? Math.round(avg * 1.15) : 0);
            const toStop = cur > 0 && stop > 0 ? (stop / cur - 1) * 100 : null;
            const res = result[key];
            return (
              <div className={`kh-card u-${u.level}`} key={key} style={u.bar ? { borderLeft: `3px solid ${u.bar}` } : undefined}>
                {/* 접힌 상태에서도 '이 종목을 어떻게 할 것인가'가 보이도록 이름·배지·수익률은 항상 노출 */}
                <button className="kh-top" onClick={() => setOpenKey(open ? null : key)} aria-expanded={open}>
                  <span className="kh-name" title={p.name}>{p.name}</span>
                  <span className="kh-urg" style={{ color: u.color, borderColor: u.color, opacity: u.level === "normal" ? 0.55 : 1 }}>{u.badge}</span>
                  <span className={`kh-pnl ${p.pnl_rate >= 0 ? "up" : "dn"}`}>{p.pnl_rate >= 0 ? "+" : ""}{p.pnl_rate}%</span>
                  <span className={`kh-caret ${open ? "on" : ""}`} aria-hidden="true">▾</span>
                </button>

                {u.rank <= 2 && (
                  <div className="kh-todo" style={{ borderLeft: `3px solid ${u.color}` }}>
                    <span className="kh-todo-k" style={{ color: u.color }}>👉 지금 할 일</span>
                    <span className="kh-todo-v">
                      {u.level === "urgent" ? "손절가에 근접했어요 — 매도할지 지금 결정하세요." : `${st.label} 시점이에요 — 오늘 한 번 확인하세요.`}
                    </span>
                  </div>
                )}

                {open && (<>
                  <div className="kh-grid">
                    <div className="kh-cell"><span>매수가</span><b title={`정확 평단 ${avg.toLocaleString()}원`}>{won(avg)}</b></div>
                    <div className="kh-cell"><span>현재가</span><b>{won(cur)}</b></div>
                    <div className="kh-cell"><span>수량</span><b>{p.qty}주</b></div>
                    <div className="kh-cell"><span>평가손익</span><b className={safeNum(p.pnl_amount) >= 0 ? "up" : "dn"}>{safeNum(p.pnl_amount) >= 0 ? "+" : ""}{safeNum(p.pnl_amount).toLocaleString()}원</b></div>
                    {tgt > 0 && (
                      <div className="kh-cell"><span>목표가</span><b className="up">{won(tgt)}{cur > 0 && <em> (+{((tgt / cur - 1) * 100).toFixed(1)}% 남음)</em>}</b></div>
                    )}
                    {stop > 0 && (
                      <div className="kh-cell"><span>손절가</span><b className="dn">{won(stop)}</b></div>
                    )}
                  </div>

                  {(p.rsi != null || p.macd != null || p.atr != null || p.ml_score != null) && (
                    <div className="kh-ind">
                      {p.rsi != null && <span>RSI {p.rsi}</span>}
                      {p.macd != null && <span>MACD {p.macd > 0 ? "+" : ""}{p.macd}</span>}
                      {p.atr != null && <span>ATR {p.atr}</span>}
                      {p.ml_score != null && <span className="kh-ml">AI {p.ml_score}</span>}
                    </div>
                  )}

                  <div className="kh-stance">
                    <span className="kh-stance-b" style={{ color: st.color, borderColor: st.color }}>🤖 {st.label}</span>
                    <span className="kh-stance-r">{st.reason}</span>
                  </div>

                  {avg > 0 && (
                    <div className="kh-trigger">
                      ⏭ <b>다음 트리거</b> · <span style={{ color: u.color, fontWeight: 700 }}>{u.badge}</span>
                      {" · "}손절 {stop.toLocaleString()}{toStop != null ? ` (${toStop >= 0 ? "+" : ""}${toStop.toFixed(1)}%)` : ""}
                      {" · "}목표 {tgt.toLocaleString()} 도달 시 절반 익절 제안
                      {!(safeNum(p.stop_loss) > 0 && safeNum(p.target) > 0) && <span className="kh-est">추정 레벨</span>}
                    </div>
                  )}

                  {p.entry_hypothesis && (
                    <div className="kh-ai"><span className="kh-ai-k">🤖 AI 가설</span><p className="kh-ai-t">{p.entry_hypothesis}</p></div>
                  )}
                </>)}

                <div className="kh-act">
                  {!open && (
                    <button className="kh-more" onClick={() => setOpenKey(key)}>상세 보기</button>
                  )}
                  <button
                    className={`kh-sell${confirmKey === key ? " confirm" : ""}`}
                    disabled={busyKey === key}
                    onClick={() => sell(key, p)}
                  >
                    {busyKey === key ? "처리 중…" : confirmKey === key ? "⚠ 실제 매도주문 실행" : "매도"}
                  </button>
                </div>

                {res && <div className={`kh-res ${res.ok ? "ok" : "bad"}`}>{res.ok ? "✅ " : "⚠ "}{res.msg}</div>}
              </div>
            );
          })}
        </div>
      </>)}

      <style jsx>{`
        .kh { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); font-family: var(--font-sans); color: var(--color-ink); }
        .kh-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .kh-title { font-size: 0.86rem; font-weight: 800; letter-spacing: -.3px; }
        .kh-sub { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); margin-left: 4px; }
        .kh-sort { margin-left: auto; flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 0.68rem; font-weight: 700; padding: 5px 10px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .kh-empty { font-size: 0.78rem; color: var(--color-ink-3); padding: 10px 0; }
        .kh-summary { font-size: 0.76rem; color: var(--color-ink-2); margin-bottom: 10px; }
        .kh-summary b { color: var(--color-ink); }
        .kh-list { display: flex; flex-direction: column; gap: 8px; }
        .kh-card { background: var(--color-card-soft, var(--inset-bg, rgba(0,0,0,.02))); border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; }
        .kh-top { display: flex; align-items: center; gap: 7px; width: 100%; background: none; border: none; padding: 0; cursor: pointer; font-family: var(--font-sans); text-align: left; }
        .kh-name { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kh-urg { flex-shrink: 0; font-size: 0.62rem; font-weight: 700; border: 1px solid; border-radius: 999px; padding: 1px 7px; }
        .kh-pnl { margin-left: auto; flex-shrink: 0; font-size: 0.82rem; font-weight: 800; font-variant-numeric: tabular-nums; }
        .kh-pnl.up, .up { color: var(--color-success, #0E9E6A); }
        .kh-pnl.dn, .dn { color: var(--color-danger, #E5484D); }
        .kh-caret { flex-shrink: 0; font-size: 0.7rem; color: var(--color-ink-3); transition: transform .18s ease; }
        .kh-caret.on { transform: rotate(180deg); }
        .kh-todo { display: flex; flex-direction: column; gap: 2px; margin: 8px 0 0; padding: 6px 9px; background: var(--color-card); border-radius: 0 8px 8px 0; }
        .kh-todo-k { font-size: 0.64rem; font-weight: 800; }
        .kh-todo-v { font-size: 0.74rem; color: var(--color-ink-2); line-height: 1.5; }
        .kh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 7px 12px; margin-top: 10px; }
        .kh-cell { display: flex; flex-direction: column; gap: 1px; }
        .kh-cell span { font-size: 0.64rem; color: var(--color-ink-3); font-weight: 600; }
        .kh-cell b { font-size: 0.8rem; font-weight: 700; font-variant-numeric: tabular-nums; color: var(--color-ink); }
        .kh-cell b em { font-style: normal; font-size: 0.68rem; font-weight: 600; margin-left: 3px; }
        .kh-ind { display: flex; flex-wrap: wrap; gap: 4px 10px; margin-top: 9px; font-size: 0.68rem; color: var(--color-ink-3); font-variant-numeric: tabular-nums; }
        .kh-ml { font-weight: 700; color: var(--color-primary); }
        .kh-stance { display: flex; align-items: flex-start; gap: 7px; margin-top: 9px; }
        .kh-stance-b { flex-shrink: 0; font-size: 0.66rem; font-weight: 800; border: 1px solid; border-radius: 999px; padding: 1px 8px; }
        .kh-stance-r { font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.5; }
        .kh-trigger { margin-top: 8px; font-size: 0.7rem; color: var(--color-ink-2); line-height: 1.55; font-variant-numeric: tabular-nums; }
        .kh-est { margin-left: 5px; font-size: 0.62rem; color: var(--color-ink-3); border: 1px solid var(--color-line); border-radius: 999px; padding: 0 6px; }
        .kh-ai { margin-top: 9px; padding-top: 8px; border-top: 1px dashed var(--color-line); }
        .kh-ai-k { font-size: 0.64rem; font-weight: 800; color: var(--color-primary); }
        .kh-ai-t { margin: 3px 0 0; font-size: 0.72rem; color: var(--color-ink-2); line-height: 1.55; }
        .kh-act { display: flex; align-items: center; justify-content: flex-end; gap: 6px; margin-top: 9px; }
        .kh-more { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 0.68rem; font-weight: 700; padding: 4px 10px; border-radius: 8px; cursor: pointer; font-family: var(--font-sans); }
        .kh-sell { border: none; background: var(--color-danger-soft); color: var(--color-danger); font-size: 0.68rem; font-weight: 700; padding: 4px 11px; border-radius: 8px; cursor: pointer; font-family: var(--font-sans); }
        .kh-sell.confirm { background: var(--color-danger); color: #fff; }
        .kh-sell:disabled { opacity: .6; cursor: default; }
        .kh-res { margin-top: 8px; font-size: 0.72rem; line-height: 1.5; word-break: keep-all; }
        .kh-res.ok { color: var(--color-success); }
        .kh-res.bad { color: var(--color-danger); }
      `}</style>
    </section>
  );
}
