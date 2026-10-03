// [S20-PEN] 연금(개인연금·퇴직연금 DC) 화면 — 단일 소스(snapshot/latest) + 진단·위험게이지·오늘할일·가구.
//   ★UI 통일: 주식/ETF/부동산 페이지와 동일한 pwa-shell + sticky-hdr(AppHeader+AssetMapTitle+SegTabs) + .card 구조·토큰.
//   반자동: 엔진이 '오늘 할 일'을 만들고, 사용자가 MTS 체결 후 [완료]. 자동주문 없음.
import { useState, useEffect, useCallback } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import AssetMapTitle from "../../components/AssetMapTitle";
import SegTabs from "../../components/shared/SegTabs";
import useSwipeTabs from "../../components/shared/useSwipeTabs";
import * as P from "../../lib/pension";

const man = (v) => (v == null ? "-" : `${Math.round(Number(v) / 1e4).toLocaleString()}만`);
const uk = (v, d = 2) => (v == null ? "-" : `${(Number(v) / 1e8).toFixed(d)}억`);
const pct = (v, d = 2) => (v == null ? "-" : `${Number(v).toFixed(d)}%`);

const PRESET_DESC = {
  "안정운영형": "위험자산 55% · 안정과 성장 균형 (분석 권장안)",
  "성장유지형": "위험자산 60%(운영상한) · 미국 성장주 강화",
  "균형형": "위험자산 50% · 채권혼합·채권 비중 확대",
};

// [사용자 지시] 탭 아래 한 줄 설명(2줄 금지·nowrap). 주식 페이지의 as-tabnote 패턴.
const LEAD = {
  PENSION_SAVINGS: { ic: "🏦", t: "과세이연·세액공제 · 진단·오늘 할 일" },
  DC: { ic: "🏛️", t: "위험자산 70% 한도 · 진단·리밸런싱" },
};

// 계좌 목록은 /api/pwa/pension/accounts 로 로드. 미도달 시 폴백.
const FALLBACK_ACCOUNTS = [
  { id: "A-PEN-01", label: "개인연금", type: "PENSION_SAVINGS" },
  { id: "A-DC-01", label: "퇴직연금", type: "DC" },
];

export default function PensionPage() {
  const [accountList, setAccountList] = useState(FALLBACK_ACCOUNTS);
  const [acct, setAcct] = useState(FALLBACK_ACCOUNTS[0]);
  const [snap, setSnap] = useState(null);
  const [risk, setRisk] = useState(null);
  const [cards, setCards] = useState(null);
  const [actions, setActions] = useState(null);
  const [household, setHousehold] = useState(null);
  const [loading, setLoading] = useState(true);
  const [snapStatus, setSnapStatus] = useState("loading"); // [S39 EA-3] loading|ok|empty|error — 조회 실패와 '데이터 없음'을 구분
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState(null);
  const [msg, setMsg] = useState("");
  const [goalOpen, setGoalOpen] = useState(false);
  const [presets, setPresets] = useState([]);
  const [curPreset, setCurPreset] = useState(null);
  const [allocating, setAllocating] = useState(false);

  // [S39 EA-3] 요청별 상태 구분 — 로딩 / 조회 실패(네트워크 reject·HTTP·JSON) / 정상 빈 응답 / 정상 데이터.
  //   ★ 과거 Promise.all 은 한 요청만 reject 돼도 setLoading(false)에 영영 도달하지 못해 화면이
  //     영구 로딩에 빠졌다. allSettled 로 바꿔 한 요청 실패가 전체를 막지 않게 한다.
  //   ★ 조회 실패를 '데이터 없음'으로 바꾸지 않는다 — 실패는 '불러오지 못함'(재시도), 없음은 '붙여넣기 시작'.
  const load = useCallback(async () => {
    setSnapStatus("loading"); setLoading(true);
    const [sR, cR, aR] = await Promise.allSettled([
      P.getSnapshot(acct.id), P.getDiagnose(acct.id), P.getActions(acct.id),
    ]);
    // 스냅샷(주 게이트): reject → error, HTTP/JSON 실패 또는 ok:false → error, ok+빈값 → empty, ok+값 → ok.
    if (sR.status !== "fulfilled") { setSnap(null); setSnapStatus("error"); }
    else {
      const { status, data } = sR.value;
      const httpOk = status >= 200 && status < 300;
      if (!httpOk || !data || data.ok === false) { setSnap(null); setSnapStatus("error"); }
      else if (!data.snapshot) { setSnap(null); setSnapStatus("empty"); }
      else { setSnap(data.snapshot); setSnapStatus("ok"); }
    }
    // 진단·행동: 실패해도 화면 전체를 막지 않는다(실패·없음 모두 빈 배열로 안전 표시).
    setCards(cR.status === "fulfilled" && cR.value.data?.ok ? (cR.value.data.cards || []) : []);
    setActions(aR.status === "fulfilled" && aR.value.data?.ok ? (aR.value.data.actions || []) : []);
    if (acct.type === "DC") {
      const r = await P.getRisk(acct.id).catch(() => null);
      setRisk(r && r.data?.ok ? r.data : null);
    } else setRisk(null);
    const h = await P.getHousehold("HH-A").catch(() => null);
    setHousehold(h && h.data?.ok ? h.data : null);
    setLoading(false);
  }, [acct]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    P.getHouseholdPolicy("HH-A").then((r) => {
      if (r.data?.ok) { setPresets(r.data.presets || []); setCurPreset(r.data.policy?.preset || null); }
    });
  }, []);

  useEffect(() => {
    let alive = true;
    P.getAccounts().then((r) => {
      if (!alive || !r.data?.ok || !r.data.accounts?.length) return;
      const list = r.data.accounts.map((a) => ({ id: a.account_id, label: a.label, type: a.account_type }));
      setAccountList(list);
      setAcct((cur) => list.find((x) => x.id === cur.id) || list[0]);
    });
    return () => { alive = false; };
  }, []);

  const applyPreset = async (name) => {
    setAllocating(true); setMsg("");
    const r = await P.allocateHousehold("HH-A", { preset: name });
    setAllocating(false);
    if (r.data?.ok) { setCurPreset(name); setGoalOpen(false); setMsg(`가구 목표 '${name}' 적용 — 계좌별 DRAFT 계획 재생성`); load(); }
    else setMsg(r.data?.error || "적용 실패");
  };
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
  const makePlanNow = async () => {
    setMsg("계획 생성 중…");
    const r = await P.makePlan(acct.id, {});
    if (r.data?.ok) { setMsg(`리밸런싱 계획 생성됨 (조정 ${r.data.moves?.length || 0}건, 액션 ${r.data.actions})`); load(); }
    else setMsg(r.data?.error || "계획 생성 실패");
  };

  const acctIdx = Math.max(0, accountList.findIndex((x) => x.id === acct.id));
  // [사용자 지시] 개인연금↔퇴직연금 탭 스와이프(ETF·부동산과 통일)
  const acctSwipe = useSwipeTabs({ index: acctIdx, count: accountList.length, onChange: (i) => setAcct(accountList[i]) });

  return (
    <div className="pension pwa-shell" onTouchStart={acctSwipe.onTouchStart} onTouchMove={acctSwipe.onTouchMove} onTouchEnd={acctSwipe.onTouchEnd}>
      {/* [사용자 지시] 상위 메뉴 고정 — 다른 자산 페이지와 동일한 sticky 헤더 */}
      <div className="sticky-hdr">
        <AppHeader />
        <AssetMapTitle current="연금" />
        <SegTabs items={accountList.map((a) => ({ key: a.id, label: a.label }))}
          index={acctIdx} onChange={(i) => setAcct(accountList[i])} ariaLabel="연금 계좌" />
        <div className="pen-lead">{(LEAD[acct.type] || {}).ic} <b>{acct.label}</b> · {(LEAD[acct.type] || {}).t || "진단·오늘 할 일·리밸런싱"}</div>
      </div>

      {snapStatus === "loading" ? (
        <div className="pen-skel" aria-busy="true">불러오는 중…</div>
      ) : snapStatus === "error" ? (
        /* [S39 EA-3] 조회 실패 — '데이터 없음'으로 바꾸지 않는다. 재시도 경로를 준다. */
        <section className="card pen-empty">
          <p><b>{acct.label}</b> 정보를 불러오지 못했습니다. 네트워크·서버 상태 때문일 수 있어요.</p>
          <button className="pen-btn" onClick={() => load()}>다시 시도</button>
        </section>
      ) : !snap ? (
        <section className="card pen-empty">
          <p>아직 <b>{acct.label}</b> 스냅샷이 없습니다. 증권사 화면을 붙여넣어 시작하세요.</p>
          <button className="pen-btn" onClick={() => setPasteOpen(true)}>증권사 화면 붙여넣기</button>
        </section>
      ) : (
        <>
          {/* 요약 히어로 — 다른 자산 페이지 히어로와 동일 스타일 */}
          <section className="hero">
            <div className="pen-eyebrow"><span>📊 {acct.label} 평가</span><span className="pen-asof">기준일 {snap.base_date || snap.as_of} · {snap.source}</span></div>
            <div className="pen-total">{uk(snap.total_value)}<span>원</span></div>
            <div className="pen-sub">{man(snap.total_value)}원</div>
            <div className="pen-rets">
              <span>누적 {pct(snap.ret_cum_pct)}</span>
              <span>연평균 {pct(snap.ret_annual_pct)}</span>
              <span>올해 {pct(snap.ret_ytd_pct)}</span>
            </div>
          </section>

          {/* 위험자산 게이지(DC) */}
          {risk && (
            <section className="card">
              <h2 className="pen-h">위험자산 한도</h2>
              <RiskGauge risk={risk} />
              <div className="pen-hint">법정 70% · 운영 {Math.round((risk.cap_operating || 0.6) * 100)}% · 여유 {man(risk.headroom_legal)}원</div>
              {risk.mismatch && <p className="pen-warn">⚠ 상품 분류가 화면값과 어긋나 계획을 활성화하지 않습니다.</p>}
            </section>
          )}

          {/* 오늘 할 일 */}
          <section className="card">
            <h2 className="pen-h">오늘 할 일</h2>
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
            )) : (
              <div className="pen-plan-cta">
                <p className="pen-muted">아직 리밸런싱 계획이 없습니다. 목표 배분으로 분할 실행 계획을 세워보세요.</p>
                <button className="pen-btn sm" onClick={makePlanNow}>리밸런싱 계획 세우기</button>
              </div>
            )}
          </section>

          {/* 진단 카드 */}
          <section className="card">
            <h2 className="pen-h">진단</h2>
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
        <section className="card">
          <div className="pen-house-h">
            <h2 className="pen-h">가구 합산</h2>
            <button className="pen-btn sm ghost" onClick={() => setGoalOpen(true)}>목표 설정{curPreset ? ` · ${curPreset}` : ""}</button>
          </div>
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

      {goalOpen && (
        <div className="pen-sheet" role="dialog">
          <div className="pen-sheet-in">
            <h3>가구 목표 설정</h3>
            <p className="pen-muted">프리셋을 고르면 두 계좌에 맞춰 자산을 배치하고(DC 안전자산 먼저), 계좌별 리밸런싱 계획(DRAFT)을 다시 만듭니다.</p>
            <div className="pen-presets">
              {(presets.length ? presets : Object.keys(PRESET_DESC)).map((name) => (
                <button key={name} className={`pen-preset ${curPreset === name ? "on" : ""}`}
                  disabled={allocating} onClick={() => applyPreset(name)}>
                  <b>{name}{curPreset === name ? " ✓" : ""}</b>
                  <span>{PRESET_DESC[name] || ""}</span>
                </button>
              ))}
            </div>
            <div className="pen-muted" style={{ marginTop: 8 }}>{allocating ? "배치 계산 중…" : "적용하면 DRAFT 계획이 생성되고, 계좌 화면에서 [완료]로 실행합니다(반자동)."}</div>
            <div className="pen-sheet-btns">
              <button className="pen-btn ghost" onClick={() => setGoalOpen(false)}>닫기</button>
            </div>
          </div>
        </div>
      )}

      <p className="pen-disc">⚠ 투자자문·세무자문이 아닙니다. 매매·실행 판단은 본인이 합니다.</p>

      <BottomNav active="assets" />

      <style jsx>{`
        /* ── 다른 자산 페이지(etf.js)와 동일한 컨테이너·헤더·카드 ── */
        .pension { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        /* 히어로 카드 — etf.js .hero 와 동일 */
        .hero { background: var(--color-card); color: var(--color-ink); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; box-shadow: var(--shadow-card); margin-bottom: 12px; }
        .pen-sub { font-size: var(--fs-2); color: var(--color-ink-3); font-weight: 600; margin-top: 2px; }
        /* [사용자 지시] 탭 아래 한 줄 설명 — 2줄 금지(nowrap+생략) */
        .pen-lead { margin: 8px 2px 12px; font-size: var(--fs-2); line-height: 1.5; color: var(--color-ink-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .pen-lead b { color: var(--color-ink); font-weight: 800; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .pen-h { font-size: var(--fs-2); margin: 0 0 10px; color: var(--color-ink-3); font-weight: 700; }
        .pen-eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .pen-total { font-size: var(--fs-8); font-weight: 800; letter-spacing: -.8px; line-height: 1; color: var(--color-ink); }
        .pen-total.sm { font-size: var(--fs-5); }
        .pen-total span { font-size: var(--fs-2); color: var(--color-ink-3); margin-left: 4px; font-weight: 700; }
        .pen-rets { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 10px; color: var(--color-ink-2); font-size: var(--fs-2); }
        .pen-asof, .pen-hint, .pen-muted { font-size: var(--fs-1); color: var(--color-ink-3); }
        .pen-hint { margin-top: 8px; }
        .pen-warn { color: var(--color-warning); font-size: var(--fs-1); margin-top: 6px; }
        .pen-todo { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--color-line); }
        .pen-todo:first-of-type { border-top: none; padding-top: 0; }
        .pen-todo-main { flex: 1; min-width: 0; font-size: var(--fs-3); }
        .pen-todo-why { font-size: var(--fs-1); color: var(--color-ink-3); word-break: keep-all; margin-top: 2px; }
        .pen-badge { font-size: var(--fs-1); color: var(--color-ink-3); border: 1px solid var(--color-line); border-radius: 6px; padding: 2px 6px; }
        .pen-plan-cta { display: flex; flex-direction: column; gap: 10px; align-items: flex-start; }
        .pen-diag { border-left: 3px solid var(--color-line); padding: 4px 0 4px 10px; margin-bottom: 10px; }
        .pen-diag:last-child { margin-bottom: 0; }
        .pen-diag-h { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
        .pen-diag-h b { font-size: var(--fs-3); }
        .pen-sev { font-size: var(--fs-1); font-weight: 800; }
        .pen-diag-v { font-size: var(--fs-2); margin: 2px 0; color: var(--color-ink-2); }
        .pen-hcard { font-size: var(--fs-2); margin-top: 8px; color: var(--color-ink-2); }
        .pen-house-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        .pen-house-h .pen-h { margin: 0; }
        .pen-presets { display: flex; flex-direction: column; gap: 8px; margin-top: 10px; }
        .pen-preset { text-align: left; background: var(--color-bg); border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 10px 12px; color: var(--color-ink); display: flex; flex-direction: column; gap: 2px; }
        .pen-preset.on { border-color: var(--color-primary); }
        .pen-preset b { font-size: var(--fs-3); }
        .pen-preset span { font-size: var(--fs-1); color: var(--color-ink-3); }
        .pen-preset:disabled { opacity: 0.6; }
        .pen-btn { background: var(--color-primary); color: var(--color-on-primary); border: none; border-radius: var(--radius-sm); padding: 10px 14px; font-weight: 800; font-family: var(--font-sans); font-size: var(--fs-3); cursor: pointer; }
        .pen-btn.sm { padding: 6px 10px; font-size: var(--fs-1); }
        .pen-btn.wide { width: 100%; margin: 2px 0 12px; }
        .pen-btn.ghost { background: var(--color-card); color: var(--color-ink-2); border: 1px solid var(--color-line); font-weight: 700; }
        .pen-btn:disabled { opacity: 0.5; }
        .pen-empty { text-align: center; }
        .pen-skel { padding: 40px; text-align: center; color: var(--color-ink-3); }
        .pen-msg { text-align: center; color: var(--color-primary); font-size: var(--fs-1); margin-bottom: 12px; }
        .pen-sheet { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: flex; align-items: flex-end; z-index: 160; }
        .pen-sheet-in { background: var(--color-card); width: 100%; max-width: 480px; margin: 0 auto; border-radius: 16px 16px 0 0; padding: 16px; }
        .pen-sheet-in h3 { margin: 0 0 10px; font-size: var(--fs-4); }
        .pen-sheet-in textarea { width: 100%; box-sizing: border-box; border: 1px solid var(--color-line); border-radius: var(--radius-sm); padding: 10px; background: var(--color-bg); color: var(--color-ink); font-family: var(--font-sans); font-size: var(--fs-3); }
        .pen-sheet-btns { display: flex; gap: 8px; margin-top: 12px; }
        .pen-sheet-btns .pen-btn { flex: 1; }
        .pen-prev { margin-top: 8px; font-size: var(--fs-2); }
        .pen-disc { font-size: var(--fs-1); color: var(--color-ink-3); text-align: center; margin: 16px 0; word-break: keep-all; }
      `}</style>
    </div>
  );
}

function RiskGauge({ risk }) {
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
        .rg-bar { position: relative; height: 16px; background: var(--color-line); border-radius: 8px; overflow: hidden; }
        .rg-fill { height: 100%; }
        .rg-mark { position: absolute; top: -3px; width: 2px; height: 22px; }
        .rg-mark.op { background: var(--color-ink-3); }
        .rg-mark.legal { background: var(--color-danger, var(--color-warning)); }
        .rg-lbl { font-size: var(--fs-2); margin-top: 6px; }
      `}</style>
    </div>
  );
}
