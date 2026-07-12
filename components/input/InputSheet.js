// ONE-HUB — 입력 간편화 시트(WO-INPUT). 주식/ETF/부동산 3탭 + 운영자 신고가.
// 참조 UX: onehub-input-demo.html. 색상은 PWA data-theme 토큰(var(--color-*))만 사용.
// 백엔드: /api/input/* 프록시 (RE 5002 / ENG 5001). 저장 즉시 보유목록 낙관적 갱신.
import { useEffect, useRef, useState } from "react";

const won = (n) => Number(n || 0).toLocaleString("ko-KR");
const eok = (m) => {
  const v = Number(m || 0) / 10000;
  return v >= 1 ? `${v.toFixed(2).replace(/\.00$/, "")}억` : `${won(m)}만`;
};
const j = async (url, opt) => {
  const r = await fetch(url, opt);
  return r.json();
};

const TABS = [
  { id: "stock", label: "주식" },
  { id: "etf", label: "ETF" },
  { id: "re", label: "부동산" },
];

export default function InputSheet({ trader = "A" }) {
  const [tab, setTab] = useState("stock");
  const [op, setOp] = useState(false);
  const [toast, setToast] = useState("");
  const toastRef = useRef();
  const flash = (m) => {
    setToast(m);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(""), 1900);
  };

  // 보유목록(탭별) — 낙관적 갱신 대상
  const [hold, setHold] = useState({ stock: [], etf: [], re: [] });

  // ── 주식/ETF 선택 상태 ──
  const [acQ, setAcQ] = useState("");
  const [acMenu, setAcMenu] = useState([]);
  const [sel, setSel] = useState(null);
  const [qty, setQty] = useState("");
  const [avg, setAvg] = useState("");

  // ── 부동산 상태 ──
  const [reQ, setReQ] = useState("");
  const [reMenu, setReMenu] = useState([]);
  const [reSel, setReSel] = useState(null);
  const [areas, setAreas] = useState([]);
  const [areaIdx, setAreaIdx] = useState("");
  const [rePrice, setRePrice] = useState("");
  const [reHint, setReHint] = useState("");
  const [spots, setSpots] = useState([]); // 운영자 신고가/속보(참고 전용)

  // ── 운영자 속보 ──
  const [opCx, setOpCx] = useState("");
  const [opPrice, setOpPrice] = useState("");
  const [opKind, setOpKind] = useState("report");
  const [opSrc, setOpSrc] = useState("kakao");

  // 보유목록 로딩
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        if (tab === "re") {
          const d = await j(`/api/input/re-search?q=`); // 데이터 소스 확인용 no-op
          const h = await j(`/api/pwa/re/holdings?trader=${trader}`).catch(() => null);
          if (alive && h?.items) setHold((s) => ({ ...s, re: h.items }));
        } else if (tab === "etf") {
          const d = await j(`/api/pwa/etf/positions?trader=${trader}`).catch(() => null);
          if (alive && d?.positions) setHold((s) => ({ ...s, etf: d.positions }));
        }
        // 주식 보유는 KIS 라이브 조회이므로 마운트 시 자동 호출하지 않음 —
        // 사용자가 [KIS에서 불러오기]를 누를 때만 브로커리지 호출.
      } catch (_) {}
    })();
    return () => { alive = false; };
  }, [tab, trader]);

  // 주식/ETF 자동완성
  useEffect(() => {
    const q = acQ.trim();
    setSel(null);
    if (!q) { setAcMenu([]); return; }
    const t = setTimeout(async () => {
      try {
        if (tab === "etf") {
          const d = await j(`/api/input/etf-search?q=${encodeURIComponent(q)}`);
          setAcMenu((d.results || []).map((r) => ({ code: r.ticker, name: r.name })));
        } else {
          const d = await j(`/api/input/stock-search?q=${encodeURIComponent(q)}`);
          setAcMenu((d.results || []).map((r) => ({ code: r.code, name: r.name })));
        }
      } catch (_) { setAcMenu([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [acQ, tab]);

  // 부동산 단지 자동완성
  useEffect(() => {
    const q = reQ.trim();
    if (reSel === reQ) return; // 선택 확정 후 재검색 방지
    if (!q) { setReMenu([]); return; }
    const t = setTimeout(async () => {
      try {
        const d = await j(`/api/input/re-search?q=${encodeURIComponent(q)}`);
        setReMenu(d.results || []);
      } catch (_) { setReMenu([]); }
    }, 180);
    return () => clearTimeout(t);
  }, [reQ, reSel]);

  const pickComplex = async (name) => {
    setReSel(name); setReQ(name); setReMenu([]);
    setAreas([]); setAreaIdx(""); setRePrice(""); setSpots([]); setReHint("불러오는 중…");
    try {
      const d = await j(`/api/input/re-areas?complex=${encodeURIComponent(name)}`);
      const a = d.areas || [];
      setAreas(a);
      setReHint(`${name} · ${a.length}개 평형이 연동되었습니다`);
    } catch (_) {
      setReHint("면적 정보를 불러오지 못했습니다");
    }
    // 운영자 신고가/속보(참고 전용) 병행 로드
    try {
      const s = await j(`/api/input/re-spot?complex_name=${encodeURIComponent(name)}`);
      setSpots(s.items || []);
    } catch (_) { setSpots([]); }
  };

  const onAreaChange = (idx) => {
    setAreaIdx(idx);
    if (idx === "") return;
    const rec = areas[+idx];
    if (rec) {
      setRePrice(String(rec.rep_price_manwon ?? ""));
      setReHint(`시세 ${eok(rec.rep_price_manwon)} · 최고 ${eok(rec.max_price_manwon)} — 매수가 자동 제안(수정 가능)`);
    }
  };

  // 추가: 주식(KIS전용이라 안내) / ETF(user_positions) / RE(user_properties)
  const addQuote = async () => {
    if (!sel) return flash("종목을 먼저 선택하세요");
    if (tab === "stock") return flash("주식 보유는 [KIS에서 불러오기]로 동기화하세요");
    const q = Number(qty);
    if (!q) return flash("수량을 입력하세요");
    setHold((s) => ({ ...s, etf: [{ ticker: sel.code, name: sel.name, quantity: q, _new: true }, ...s.etf] }));
    flash(`${sel.name} 추가 중…`);
    try {
      const d = await j(`/api/input/etf-add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trader_id: trader, ticker: sel.code, quantity: q, buy_price: Number(avg) || null }),
      });
      flash(d.ok ? `${sel.name} 추가됨` : `실패: ${d.error || ""}`);
    } catch (_) { flash("네트워크 오류"); }
    setSel(null); setAcQ(""); setQty(""); setAvg("");
  };

  const kisImport = async () => {
    flash("KIS 잔고 불러오는 중…");
    try {
      const d = await j(`/api/input/kis-import?trader_id=${trader}`, { method: "POST" });
      if (d.ok) { setHold((s) => ({ ...s, stock: d.items || [] })); flash(`KIS 동기화 · 주식 ${d.count}건`); }
      else flash(`KIS 실패: ${d.error || ""}`);
    } catch (_) { flash("네트워크 오류"); }
  };

  const addRE = async () => {
    if (!reSel || areaIdx === "") return flash("단지와 면적을 선택하세요");
    const rec = areas[+areaIdx];
    const priceManwon = Number(rePrice) || rec.rep_price_manwon;
    setHold((s) => ({ ...s, re: [{ 단지명: reSel, 전용면적: rec.m2, eval_uk: priceManwon / 10000, _new: true }, ...s.re] }));
    flash(`${reSel} ${rec.m2}㎡ 등록 중…`);
    try {
      const d = await j(`/api/input/re-add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trader_id: trader, 단지명: reSel, 전용면적: rec.m2, 매수가_uk: priceManwon / 10000 }),
      });
      flash(d.ok ? `${reSel} 등록됨` : `실패: ${d.error || ""}`);
    } catch (_) { flash("네트워크 오류"); }
    setReSel(null); setReQ(""); setAreas([]); setAreaIdx(""); setRePrice("");
  };

  const addSpot = async () => {
    if (!opCx.trim() || !opPrice) return flash("단지·면적과 가격을 입력하세요");
    try {
      const d = await j(`/api/input/re-spot`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ complex_name: opCx.trim(), price_manwon: Number(opPrice), kind: opKind, source: opSrc }),
      });
      if (d.ok) { flash(`속보 등록 · ${opCx} ${eok(opPrice)} — 미확정 레이어`); setOpCx(""); setOpPrice(""); }
      else flash(d.error === "operator only" ? "운영자 키 미설정/불일치" : `실패: ${d.error || ""}`);
    } catch (_) { flash("네트워크 오류"); }
  };

  const isRE = tab === "re";
  const holdList = hold[tab] || [];

  return (
    <div className="sheet">
      <div className="top">
        <div className="brand">ONE<span>·</span>HUB <em>입력</em></div>
        <div className={`optog ${op ? "on" : ""}`} onClick={() => { setOp(!op); flash(!op ? "운영자 모드 ON" : "운영자 모드 OFF"); }}>
          <span className="oplab">운영자 모드</span><div className="switch" />
        </div>
      </div>

      <div className="tabs">
        {TABS.map((t) => (
          <div key={t.id} className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => { setTab(t.id); setSel(null); setReSel(null); }}>{t.label}</div>
        ))}
      </div>

      {/* 보유 목록 상시 노출 */}
      <div className="card">
        <h3>현재 보유 · {TABS.find((t) => t.id === tab).label}</h3>
        {holdList.length === 0 ? (
          <div className="empty"><b>아직 등록된 항목이 없습니다.</b><br />아래에서 검색해 추가하거나 KIS에서 불러오세요.</div>
        ) : holdList.map((h, i) => (
          <div className="rowline" key={i}>
            <div>
              <div className="nm">{h.name || h.단지명 || h.ticker}{h.전용면적 ? ` ${h.전용면적}㎡` : ""}</div>
              <div className="sub">
                {isRE ? (h.eval_uk != null ? `평가 ${Number(h.eval_uk).toFixed(2)}억` : "")
                  : tab === "etf" ? `${h.quantity ?? h.qty ?? 0}주`
                  : `${h.qty ?? 0}주 · 평단 ${won(h.avg_price)}`}
              </div>
            </div>
            <div className="val">{h._new ? <span className="pos">신규</span>
              : tab === "stock" && h.pnl != null ? <span className={h.pnl >= 0 ? "pos" : "neg"}>{h.pnl >= 0 ? "+" : ""}{won(h.pnl)}</span>
              : ""}</div>
          </div>
        ))}
      </div>

      {/* 입력 */}
      <div className="card">
        <h3>{isRE ? "내 단지 등록" : tab === "etf" ? "ETF 추가" : "종목 추가"}</h3>

        {!isRE && (
          <>
            <div className="field ac">
              <label>{tab === "etf" ? "티커 · 이름" : "종목번호 · 이름"}</label>
              <input value={sel ? `${sel.name} (${sel.code})` : acQ} placeholder={tab === "etf" ? "예: SMH · QQQM" : "예: 032800 · 삼성"}
                onChange={(e) => { setSel(null); setAcQ(e.target.value); }} autoComplete="off" />
              {acMenu.length > 0 && !sel && (
                <div className="menu">
                  {acMenu.map((x) => (
                    <div className="opt" key={x.code} onMouseDown={() => { setSel(x); setAcMenu([]); }}>
                      <span>{x.name}</span><span className="code">{x.code}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="two">
              <div className="field"><label>수량</label><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" /></div>
              <div className="field"><label>{tab === "etf" ? "평단가 (USD)" : "평단가 (원)"}</label><input type="number" value={avg} onChange={(e) => setAvg(e.target.value)} placeholder="0" /></div>
            </div>
            <div className="btnrow">
              <button className="btn ghost" onClick={kisImport}>KIS에서 불러오기</button>
              <button className="btn" onClick={addQuote}>추가</button>
            </div>
            {tab === "stock" && <div className="note">주식 보유는 KIS 잔고와 동기화됩니다(수동 추가 대신 불러오기).</div>}
          </>
        )}

        {isRE && (
          <>
            <div className="field ac">
              <label>아파트 이름</label>
              <input value={reSel || reQ} placeholder="예: 시범우성"
                onChange={(e) => { setReSel(null); setReQ(e.target.value); }} autoComplete="off" />
              {reMenu.length > 0 && !reSel && (
                <div className="menu">
                  {reMenu.map((n) => (
                    <div className="opt" key={n} onMouseDown={() => pickComplex(n)}><span>{n}</span></div>
                  ))}
                </div>
              )}
            </div>
            <div className="field">
              <label>전용면적 (선택 시 자동 연동)</label>
              <select value={areaIdx} disabled={areas.length === 0} onChange={(e) => onAreaChange(e.target.value)}>
                <option value="">{areas.length ? "면적 선택" : "단지를 먼저 선택하세요"}</option>
                {areas.map((a, i) => (
                  <option key={i} value={i}>{a.m2}㎡ · 시세 {eok(a.rep_price_manwon)} · 최고 {eok(a.max_price_manwon)} (n={a.n})</option>
                ))}
              </select>
              <div className="hint">{reHint}</div>
            </div>
            <div className="field">
              <label>매수가 (만원 · 최근 실거래 자동 제안)</label>
              <input type="number" value={rePrice} onChange={(e) => setRePrice(e.target.value)} placeholder="0" />
            </div>

            {spots.length > 0 && (
              <div className="spots">
                <div className="spots-h">운영자 신고가 · 속보 <span>참고 전용 · 엔진(시세·갭) 미반영</span></div>
                {spots.map((s) => (
                  <div className="spot-row" key={s.id}>
                    <span className={`spot-kind k-${s.kind}`}>{s.kind === "report" ? "신고가" : s.kind === "listing" ? "매물호가" : "소문"}</span>
                    <span className="spot-nm">{s.complex_name}{s.area_m2 ? ` ${s.area_m2}㎡` : ""}</span>
                    <span className="spot-px">{eok(s.price_manwon)}</span>
                  </div>
                ))}
              </div>
            )}

            <button className="btn" onClick={addRE}>내 단지로 추가</button>

            {op ? (
              <div className="oppanel">
                <div className="oph">🔒 신고가 · 속보 입력 <span>운영자 전용</span></div>
                <div className="opnote">정보원 반영이 늦는 신고가/매물을 수시 입력. 확정 실거래와 분리 저장 · 엔진(ONE Score·갭)에 미반영.</div>
                <div className="field"><label>단지 · 면적</label><input value={opCx} onChange={(e) => setOpCx(e.target.value)} placeholder="예: 시범삼성 84.7㎡" /></div>
                <div className="field"><label>가격 (만원)</label><input type="number" value={opPrice} onChange={(e) => setOpPrice(e.target.value)} placeholder="0" /></div>
                <div className="field"><label>유형</label>
                  <div className="chips">
                    {[["report", "신고가"], ["listing", "매물호가"], ["rumor", "소문"]].map(([k, l]) => (
                      <div key={k} className={`chip ${opKind === k ? "sel" : ""}`} onClick={() => setOpKind(k)}>{l}</div>
                    ))}
                  </div>
                </div>
                <div className="field"><label>출처</label>
                  <div className="chips">
                    {[["kakao", "카카오톡"], ["sns", "SNS"], ["naver", "네이버"], ["manual", "수동"]].map(([k, l]) => (
                      <div key={k} className={`chip ${opSrc === k ? "sel" : ""}`} onClick={() => setOpSrc(k)}>{l}</div>
                    ))}
                  </div>
                </div>
                <button className="btn amber" onClick={addSpot}>속보 등록</button>
              </div>
            ) : (
              <div className="lock">🔒 신고가·속보 입력란은 <b>운영자 모드</b>에서만 열립니다. (우측 상단 토글)</div>
            )}
          </>
        )}
      </div>

      {toast && <div className="toast show">{toast}</div>}

      <style jsx>{`
        .sheet { max-width: 520px; margin: 0 auto; padding: 16px 14px 60px; color: var(--color-text); font-family: var(--font-body, inherit); }
        .top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; }
        .brand { font-weight: 800; letter-spacing: -.02em; font-size: 19px; }
        .brand span { color: var(--color-primary); }
        .brand em { font-style: normal; font-size: 13px; color: var(--color-muted); font-weight: 600; }
        .optog { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--color-muted); cursor: pointer; user-select: none; }
        .switch { width: 40px; height: 22px; border-radius: 99px; background: var(--color-line); position: relative; transition: .2s; }
        .switch::after { content: ""; position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: .2s; }
        .optog.on .switch { background: var(--color-warning, var(--amber)); }
        .optog.on .switch::after { left: 20px; }
        .optog.on .oplab { color: var(--color-warning, var(--amber)); font-weight: 700; }
        .tabs { display: flex; gap: 6px; background: var(--color-card); padding: 5px; border-radius: 14px; margin-bottom: 14px; border: 1px solid var(--color-line); }
        .tab { flex: 1; text-align: center; padding: 9px 0; border-radius: 10px; font-weight: 600; font-size: 14px; color: var(--color-muted); cursor: pointer; transition: .15s; }
        .tab.active { background: var(--color-primary); color: #fff; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: 16px; padding: 16px; margin-bottom: 14px; }
        .card h3 { margin: 0 0 6px; font-size: 13px; color: var(--color-muted); font-weight: 600; }
        .rowline { display: flex; justify-content: space-between; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .rowline:last-child { border-bottom: none; }
        .nm { font-weight: 700; }
        .sub { font-size: 12.5px; color: var(--color-muted); }
        .val { text-align: right; font-weight: 700; }
        .pos { color: var(--color-success); font-size: 12.5px; }
        .neg { color: var(--color-danger); font-size: 12.5px; }
        .empty { text-align: center; color: var(--color-muted); padding: 22px 8px; font-size: 14px; }
        .empty b { color: var(--color-text); }
        .field { margin-top: 12px; }
        .field label { display: block; font-size: 12.5px; color: var(--color-muted); margin-bottom: 5px; font-weight: 600; }
        .ac { position: relative; }
        input, select { width: 100%; padding: 12px 13px; border: 1.5px solid var(--color-line); border-radius: 11px; font-size: 15px; font-family: inherit; background: var(--color-bg); color: var(--color-text); outline: none; transition: .15s; }
        input:focus, select:focus { border-color: var(--color-primary); box-shadow: 0 0 0 3px var(--color-primary-soft); }
        .menu { position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: var(--color-card); border: 1px solid var(--color-line); border-radius: 11px; z-index: 20; max-height: 210px; overflow: auto; box-shadow: 0 8px 24px rgba(0,0,0,.12); }
        .opt { padding: 11px 13px; cursor: pointer; display: flex; justify-content: space-between; gap: 8px; }
        .opt:hover { background: var(--color-primary-soft); }
        .opt .code { color: var(--color-muted); font-size: 12.5px; }
        .two { display: flex; gap: 10px; }
        .two > * { flex: 1; }
        .hint { font-size: 12px; color: var(--color-primary); margin-top: 5px; min-height: 16px; }
        .note { font-size: 12px; color: var(--color-muted); margin-top: 10px; }
        .spots { margin-top: 12px; border: 1px solid var(--color-line); border-radius: 12px; padding: 10px 12px; background: var(--color-bg); }
        .spots-h { font-size: 12px; font-weight: 700; color: var(--color-text); margin-bottom: 6px; }
        .spots-h span { font-weight: 500; color: var(--color-muted); font-size: 11px; margin-left: 6px; }
        .spot-row { display: flex; align-items: center; gap: 8px; padding: 5px 0; font-size: 13px; }
        .spot-kind { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: var(--color-warning-soft, var(--color-primary-soft)); color: var(--color-warning-ink, var(--color-warning)); }
        .spot-nm { flex: 1; }
        .spot-px { font-weight: 700; }
        .btn { display: block; width: 100%; margin-top: 14px; padding: 13px; border: none; border-radius: 12px; background: var(--color-primary); color: #fff; font-weight: 700; font-size: 15px; font-family: inherit; cursor: pointer; transition: .15s; }
        .btn:active { transform: scale(.99); }
        .btn.ghost { background: var(--color-primary-soft); color: var(--color-primary); }
        .btn.amber { background: var(--color-warning, var(--amber)); }
        .btnrow { display: flex; gap: 10px; }
        .btnrow .btn { margin-top: 14px; }
        .oppanel { border: 1.5px dashed var(--color-warning, var(--amber)); background: var(--color-warning-soft, transparent); border-radius: 14px; padding: 14px; margin-top: 14px; }
        .oph { display: flex; align-items: center; gap: 6px; font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); font-size: 13.5px; }
        .oph span { font-weight: 600; font-size: 11px; opacity: .8; }
        .opnote { font-size: 12px; color: var(--color-warning-ink, var(--color-warning)); opacity: .85; margin: 2px 0 4px; }
        .chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
        .chip { padding: 7px 12px; border: 1.5px solid var(--color-line); border-radius: 99px; font-size: 13px; cursor: pointer; background: var(--color-bg); }
        .chip.sel { border-color: var(--color-warning, var(--amber)); color: var(--color-warning-ink, var(--color-warning)); font-weight: 700; }
        .lock { font-size: 11px; color: var(--color-muted); background: var(--color-bg); border-radius: 8px; padding: 8px 10px; margin-top: 10px; }
        .toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); background: var(--color-ink, #1f2a37); color: #fff; padding: 12px 18px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 50; box-shadow: 0 8px 30px rgba(0,0,0,.25); }
      `}</style>
    </div>
  );
}
