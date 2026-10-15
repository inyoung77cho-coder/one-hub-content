// [S45 SD] 공유로 받기 1단계(텍스트) — Web Share Target(GET). 안드로이드 공유 시트에서 ONE-HUB를
//   고르면 여기로 title/text/url 이 쿼리로 들어온다. ★서비스 워커를 건드리지 않는다(GET+페이지 처리).
//   ★자동 저장 금지 — 사람이 확인하고 저장. ★원문·발신자 저장 금지 — 확인된 수치·단지명만 남긴다.
//   ★받은 텍스트를 서버로 보내지 않는다 — 전부 화면에서 처리하고 로컬에 저장.
//   저장 결과는 SC(reAsking)와 같은 곳: 실거래와 분리, 엔진 미반영, 본인 계정 로컬.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import BottomNav from "../../components/BottomNav";
import { getTrader } from "../../lib/trader";
import { addAsking } from "../../lib/reAsking";

const MEMO_KEY = "onehub_quick_memos"; // [SD] '그냥 메모' 로컬 저장(본인 계정)

// 공유 텍스트에서 단지명·평형·호가(만원)를 best-effort 로 추출(사람이 확인·수정). 발신자/원문은 버린다.
function parseShared(text, complexes) {
  const t = String(text || "");
  const hit = { complex: "", pyeong: "", low: "", high: "" };
  // 등록된 내 단지명이 텍스트에 있으면 그걸 고른다.
  hit.complex = complexes.find((c) => c && t.includes(c)) || "";
  // 평형: "84㎡" / "84제곱" / "34평"
  const mArea = t.match(/(\d{2,3})\s*(㎡|제곱|평)/);
  if (mArea) hit.pyeong = mArea[1];
  // 금액(억 단위) 후보 전부 → 만원으로 환산해 최저/최고.
  const won = [];
  const re = /(\d{1,2})\s*억\s*(\d{1,3}(?:,?\d{3})?)?\s*(?:만)?/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const eok = Number(m[1]);
    const man = m[2] ? Number(String(m[2]).replace(/,/g, "")) : 0;
    if (eok > 0) won.push(eok * 10000 + man);
  }
  if (won.length) {
    won.sort((a, b) => a - b);
    hit.low = String(won[0]);
    hit.high = String(won[won.length - 1]);
  }
  return hit;
}

export default function SharePage() {
  const router = useRouter();
  const [received, setReceived] = useState({ title: "", text: "", url: "" });
  const [complexes, setComplexes] = useState([]);
  const [mode, setMode] = useState("re"); // 're'=부동산 호가 | 'memo'=그냥 메모
  const [f, setF] = useState({ complex: "", pyeong: "", low: "", high: "", count: "", date: "", source: "" });
  const [memo, setMemo] = useState("");
  const [memos, setMemos] = useState([]);
  const [msg, setMsg] = useState("");
  const todayStr = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!router.isReady) return;
    const q = router.query;
    const text = typeof q.text === "string" ? q.text : "";
    setReceived({ title: typeof q.title === "string" ? q.title : "", text, url: typeof q.url === "string" ? q.url : "" });
    // 내 등록 단지(대표+추가) 로드
    let cxs = [];
    try {
      const mp = JSON.parse(localStorage.getItem("onehub_re_my_property") || "null");
      const rp = JSON.parse(localStorage.getItem("onehub_re_properties") || "[]");
      cxs = [mp?.name, ...(Array.isArray(rp) ? rp.map((p) => p.name) : [])].filter(Boolean);
      cxs = Array.from(new Set(cxs));
    } catch (e) {}
    setComplexes(cxs);
    try { const mm = JSON.parse(localStorage.getItem(MEMO_KEY) || "[]"); if (Array.isArray(mm)) setMemos(mm); } catch (e) {}
    const parsed = parseShared(text, cxs);
    setF((v) => ({ ...v, complex: parsed.complex || cxs[0] || "", pyeong: parsed.pyeong, low: parsed.low, high: parsed.high, date: todayStr }));
    setMemo(text.slice(0, 400));
    if (!cxs.length) setMode("memo");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.isReady]);

  const saveRe = () => {
    const res = addAsking({ trader: getTrader(), complex: f.complex, pyeong: f.pyeong, lowMan: f.low, highMan: f.high, count: f.count, date: f.date, source: f.source });
    if (!res.ok) { setMsg("⚠️ " + (res.error || "입력 오류")); return; }
    setMsg("✓ 내 단지 호가로 기록했습니다(미확정·표시 전용).");
    setTimeout(() => router.replace("/pwa/realestate"), 700);
  };
  const saveMemo = () => {
    const txt = String(memo || "").trim().slice(0, 400);
    if (!txt) { setMsg("⚠️ 메모가 비어 있습니다."); return; }
    // 발신자/원문 전체가 아니라, 사용자가 확인·편집한 텍스트만 저장.
    const next = [{ id: `memo-${Date.now()}`, text: txt, ts: Date.now() }, ...memos].slice(0, 30);
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(next)); } catch (e) {}
    setMemos(next); setMemo(""); setMsg("✓ 메모로 저장했습니다.");
  };
  const delMemo = (id) => {
    const next = memos.filter((m) => m.id !== id);
    try { localStorage.setItem(MEMO_KEY, JSON.stringify(next)); } catch (e) {}
    setMemos(next);
  };

  const hasShare = received.text || received.title || received.url;

  return (
    <>
      <Head><title>공유 받기 · ONE-HUB</title></Head>
      <main className="sh">
        <h1 className="sh-h">공유로 받기</h1>
        <p className="sh-sub">다른 앱에서 공유한 내용을 확인하고 저장합니다. <b>확인하기 전에는 아무것도 저장되지 않습니다.</b></p>

        {!hasShare ? (
          <div className="sh-card sh-empty">
            받은 내용이 없습니다. 카카오톡·부동산 앱 등에서 텍스트를 <b>공유 → ONE-HUB</b>로 보내면 여기로 들어옵니다.
            <div className="sh-ios">※ 아이폰(사파리)은 이 기능을 지원하지 않습니다. <b>안드로이드 전용</b>입니다.</div>
          </div>
        ) : (
          <>
            <div className="sh-card">
              <div className="sh-lbl">받은 내용</div>
              {received.title && <div className="sh-rc"><b>{received.title}</b></div>}
              {received.text && <div className="sh-rc sh-pre">{received.text}</div>}
              {received.url && <div className="sh-rc sh-url">{received.url}</div>}
            </div>

            <div className="sh-modes">
              <button className={`sh-mode ${mode === "re" ? "on" : ""}`} onClick={() => setMode("re")} disabled={!complexes.length}>부동산 시세 메모</button>
              <button className={`sh-mode ${mode === "memo" ? "on" : ""}`} onClick={() => setMode("memo")}>그냥 메모</button>
            </div>

            {mode === "re" ? (
              !complexes.length ? (
                <div className="sh-card sh-empty">먼저 <b>부동산 화면에서 내 단지를 등록</b>하면, 공유받은 매물 정보를 그 단지의 호가로 기록할 수 있습니다.</div>
              ) : (
                <div className="sh-card">
                  <div className="sh-note">받은 숫자를 <b>미리 채웠습니다 — 확인·수정 후</b> 저장하세요. 실거래가 아닌 <b>미확정 호가</b>로, 표시 전용입니다(자산 합계·추세에 넣지 않음).</div>
                  <div className="sh-grid">
                    <label>단지
                      <select value={f.complex} onChange={(e) => setF((v) => ({ ...v, complex: e.target.value }))}>
                        {complexes.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </label>
                    <label>평형(㎡)<input value={f.pyeong} onChange={(e) => setF((v) => ({ ...v, pyeong: e.target.value }))} placeholder="84" /></label>
                    <label>최저 호가(만원)<input type="number" inputMode="numeric" value={f.low} onChange={(e) => setF((v) => ({ ...v, low: e.target.value }))} /></label>
                    <label>최고 호가(만원)<input type="number" inputMode="numeric" value={f.high} onChange={(e) => setF((v) => ({ ...v, high: e.target.value }))} /></label>
                    <label>매물 건수<input type="number" inputMode="numeric" value={f.count} onChange={(e) => setF((v) => ({ ...v, count: e.target.value }))} placeholder="선택" /></label>
                    <label>조회일<input type="date" value={f.date} max={todayStr} onChange={(e) => setF((v) => ({ ...v, date: e.target.value }))} /></label>
                    <label>출처(사이트명)<input value={f.source} onChange={(e) => setF((v) => ({ ...v, source: e.target.value }))} placeholder="예: 네이버부동산" /></label>
                  </div>
                  <div className="sh-btns">
                    <button className="sh-save" onClick={saveRe}>확인 후 기록</button>
                    <button className="sh-cancel" onClick={() => router.replace("/pwa")}>버리기</button>
                  </div>
                </div>
              )
            ) : (
              <div className="sh-card">
                <div className="sh-note">확인·편집한 텍스트만 메모로 남습니다(발신자·원문 전체는 저장하지 않습니다).</div>
                <textarea className="sh-ta" value={memo} onChange={(e) => setMemo(e.target.value)} rows={5} maxLength={400} />
                <div className="sh-btns">
                  <button className="sh-save" onClick={saveMemo}>메모 저장</button>
                  <button className="sh-cancel" onClick={() => router.replace("/pwa")}>버리기</button>
                </div>
                {memos.length > 0 && (
                  <div className="sh-memos">
                    <div className="sh-lbl">최근 메모</div>
                    {memos.slice(0, 8).map((m) => (
                      <div className="sh-memo" key={m.id}>
                        <span>{m.text}</span>
                        <button onClick={() => delMemo(m.id)} aria-label="메모 삭제">✕</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {msg && <div className="sh-msg">{msg}</div>}
            <div className="sh-ios">※ 아이폰(사파리)은 공유 대상 등록을 지원하지 않습니다. <b>안드로이드 전용</b>입니다.</div>
          </>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .sh { max-width: 560px; margin: 0 auto; padding: 14px 14px 40px; background: var(--color-bg); min-height: 100vh; }
        .sh-h { font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); margin: 6px 0 4px; }
        .sh-sub { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; margin: 0 0 14px; word-break: keep-all; }
        .sh-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 14px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .sh-empty { font-size: var(--fs-2); color: var(--color-ink-3); line-height: 1.6; }
        .sh-lbl { font-size: var(--fs-1); font-weight: 800; color: var(--color-ink-3); margin-bottom: 6px; }
        .sh-rc { font-size: var(--fs-2); color: var(--color-ink); margin-top: 4px; word-break: break-all; }
        .sh-pre { white-space: pre-wrap; color: var(--color-ink-2); line-height: 1.5; }
        .sh-url { color: var(--color-primary); font-size: var(--fs-1); }
        .sh-modes { display: flex; gap: 8px; margin-bottom: 12px; }
        .sh-mode { flex: 1; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 999px; padding: 9px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .sh-mode.on { border-color: var(--color-primary); background: var(--color-primary-soft); color: var(--color-primary); }
        .sh-mode:disabled { opacity: .5; cursor: not-allowed; }
        .sh-note { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; margin-bottom: 10px; word-break: keep-all; }
        .sh-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; }
        .sh-grid label { display: flex; flex-direction: column; gap: 3px; font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .sh-grid input, .sh-grid select { border: 1px solid var(--color-line); border-radius: 8px; padding: 8px 9px; font-size: var(--fs-2); font-family: inherit; background: var(--color-card); color: var(--color-ink); }
        .sh-ta { width: 100%; border: 1px solid var(--color-line); border-radius: 8px; padding: 9px; font-size: var(--fs-2); font-family: inherit; background: var(--color-card); color: var(--color-ink); resize: vertical; }
        .sh-btns { display: flex; gap: 8px; margin-top: 12px; }
        .sh-save { flex: 1; border: none; background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 11px; font-size: var(--fs-3); font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .sh-cancel { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-3); border-radius: var(--radius-sm); padding: 11px 16px; font-size: var(--fs-2); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .sh-memos { margin-top: 12px; border-top: 1px solid var(--color-line); padding-top: 10px; }
        .sh-memo { display: flex; align-items: flex-start; gap: 8px; font-size: var(--fs-1); color: var(--color-ink-2); padding: 5px 0; }
        .sh-memo span { flex: 1; min-width: 0; line-height: 1.5; word-break: break-all; }
        .sh-memo button { border: none; background: none; color: var(--color-ink-3); cursor: pointer; font-size: var(--fs-2); }
        .sh-msg { font-size: var(--fs-2); color: var(--color-primary); font-weight: 700; margin: 8px 2px; }
        .sh-ios { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; }
      `}</style>
    </>
  );
}
