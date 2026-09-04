// [S29-5] 맥락 검색 시트 — 한 입력창에서 보유 종목·종목코드·단지·ETF·저장 단어·지난 판단을 함께 찾는다.
//   ★새 API 없음: 전부 이미 화면이 가진 데이터(localStorage + 기존 엔드포인트)를 클라에서 거른다.
//   현재 페이지 것을 위에(context). 최근 검색 5개(로컬). 빈 입력엔 '무엇을 찾을 수 있는지' 예시.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { cachedJson } from "../lib/quoteCache";
import { getTrader } from "../lib/trader";
import { getHoldings as getEtfHoldings } from "../lib/etfHoldings";
import { getVocab } from "../lib/vocabNote";
import { getLedger as getVerdictLedger } from "../lib/verdictLedger";

const RECENT_KEY = "onehub_recent_search";

function loadLocal(key, def) {
  if (typeof window === "undefined") return def;
  try { const v = JSON.parse(localStorage.getItem(key) || "null"); return v == null ? def : v; } catch { return def; }
}

// context(현재 경로) → 우선 표시할 결과 종류
function primaryKind(pathname) {
  if (!pathname) return null;
  if (pathname.includes("realestate")) return "complex";
  if (pathname.includes("etf")) return "etf";
  if (pathname.includes("vocab") || pathname.includes("english")) return "vocab";
  if (pathname.includes("report")) return "verdict";
  return "stock";
}

export default function SearchSheet({ onClose }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [positions, setPositions] = useState([]);
  const [remoteStocks, setRemoteStocks] = useState([]);
  const [recent, setRecent] = useState(() => loadLocal(RECENT_KEY, []));
  const debTimer = useRef(null);

  // 로컬 소스(동기)
  const local = useMemo(() => {
    const tr = (() => { try { return getTrader(); } catch { return "A"; } })();
    const complexes = [];
    const my = loadLocal("onehub_re_my_property", null);
    if (my && my.name) complexes.push({ name: my.name, mine: true });
    (loadLocal("onehub_re_properties", []) || []).forEach((p) => { if (p && p.name) complexes.push({ name: p.name }); });
    let etf = [];
    try { etf = getEtfHoldings() || []; } catch {}
    let vocab = [];
    try { vocab = getVocab(tr) || []; } catch {}
    let verdict = [];
    try { verdict = getVerdictLedger(tr) || []; } catch {}
    return { complexes, etf, vocab, verdict };
  }, []);

  useEffect(() => {
    cachedJson(`/api/pwa-dashboard?trader=${(() => { try { return getTrader(); } catch { return "A"; } })()}`)
      .then((d) => { let p = d?.balance?.positions; if (typeof p === "string") { try { p = JSON.parse(p); } catch { p = []; } } setPositions(Array.isArray(p) ? p : []); })
      .catch(() => {});
  }, []);

  // 종목 코드·이름(신규) — 기존 /api/stocks-search 디바운스(새 API 아님)
  useEffect(() => {
    clearTimeout(debTimer.current);
    if (!q.trim() || q.trim().length < 1) { setRemoteStocks([]); return; }
    debTimer.current = setTimeout(() => {
      cachedJson(`/api/stocks-search?q=${encodeURIComponent(q.trim())}`)
        .then((d) => setRemoteStocks((d?.results || d?.items || d || []).slice(0, 6)))
        .catch(() => setRemoteStocks([]));
    }, 250);
    return () => clearTimeout(debTimer.current);
  }, [q]);

  const kw = q.trim().toLowerCase();
  const match = (s) => !kw || String(s || "").toLowerCase().includes(kw);

  const groups = useMemo(() => {
    const g = [];
    g.push({ kind: "stock", title: "내 보유 종목", items: positions.filter((p) => match(p.name) || match(p.code)).slice(0, 6).map((p) => ({ label: p.name, sub: p.code, go: `/pwa?tab=portfolio` })) });
    g.push({ kind: "complex", title: "단지", items: local.complexes.filter((c) => match(c.name)).slice(0, 6).map((c) => ({ label: c.name, sub: c.mine ? "내 단지" : "관심", go: `/pwa/realestate` })) });
    g.push({ kind: "etf", title: "보유 ETF", items: (local.etf || []).filter((e) => match(e.ticker) || match(e.name)).slice(0, 6).map((e) => ({ label: e.name || e.ticker, sub: e.ticker, go: `/pwa/etf` })) });
    g.push({ kind: "vocab", title: "저장한 단어", items: (local.vocab || []).filter((v) => match(v.text) || match(v.meaning)).slice(0, 6).map((v) => ({ label: v.text, sub: v.meaning, go: `/pwa/vocab` })) });
    g.push({ kind: "verdict", title: "지난 판단", items: (local.verdict || []).filter((v) => match(v.name) || match(v.code)).slice(0, 6).map((v) => ({ label: v.name || v.code, sub: v.decision === "pass" ? "관망" : "보유", go: `/pwa?tab=report&sec=vs` })) });
    if (kw) g.push({ kind: "new", title: "종목 검색(AI 분석)", items: (remoteStocks || []).map((s) => ({ label: s.name || s.stock || s, sub: s.code || "", go: `/pwa?tab=analyze&code=${encodeURIComponent(s.code || "")}&name=${encodeURIComponent(s.name || "")}` })) });
    const prim = primaryKind(router.pathname);
    return g.filter((x) => x.items.length > 0).sort((a, b) => (a.kind === prim ? -1 : b.kind === prim ? 1 : 0));
  }, [q, positions, remoteStocks, local, router.pathname]);

  const pushRecent = (label) => {
    try { const next = [label, ...recent.filter((r) => r !== label)].slice(0, 5); setRecent(next); localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch {}
  };
  const go = (item) => { pushRecent(item.label); onClose && onClose(); router.push(item.go); };

  return (
    <div className="ss-scrim" onClick={onClose}>
      <div className="ss" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="검색">
        <div className="ss-inbar">
          <span aria-hidden="true">🔍</span>
          <input className="ss-in" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="종목·단지·ETF·단어·지난 판단 찾기" />
          <button className="ss-x" onClick={onClose} aria-label="닫기">✕</button>
        </div>

        {!kw && (
          <div className="ss-hint">
            {recent.length > 0 && (
              <div className="ss-recent">
                <div className="ss-rh">최근 검색</div>
                <div className="ss-chips">{recent.map((r, i) => <button key={i} className="ss-chip" onClick={() => setQ(r)}>{r}</button>)}</div>
              </div>
            )}
            <div className="ss-eg">이런 걸 찾을 수 있어요 · 내 보유 종목 · 단지 이름 · ETF 티커 · 저장한 단어 · 지난 판단</div>
          </div>
        )}

        <div className="ss-results">
          {groups.length === 0 && kw ? (
            <div className="ss-empty">‘{q}’에 해당하는 것을 못 찾았어요. 종목명·단지명·티커로 다시 찾아보세요.</div>
          ) : groups.map((g) => (
            <div className="ss-grp" key={g.kind}>
              <div className="ss-gh">{g.title}</div>
              {g.items.map((it, i) => (
                <button className="ss-row" key={i} onClick={() => go(it)}>
                  <span className="ss-lb">{it.label}</span>
                  {it.sub ? <span className="ss-sb">{it.sub}</span> : null}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
      <style jsx>{`
        .ss-scrim { position: fixed; inset: 0; z-index: 1300; background: rgba(0,0,0,0.35); display: flex; align-items: flex-start; justify-content: center; padding-top: calc(env(safe-area-inset-top,0px) + 12px); }
        .ss { width: 100%; max-width: 480px; margin: 0 12px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-float); max-height: 82vh; display: flex; flex-direction: column; overflow: hidden; }
        .ss-inbar { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-bottom: 1px solid var(--color-line); }
        .ss-in { flex: 1; border: none; background: transparent; color: var(--color-ink); font-size: var(--fs-5); font-family: var(--font-sans); outline: none; }
        .ss-x { border: none; background: none; color: var(--color-ink-3); font-size: var(--fs-4); cursor: pointer; }
        .ss-hint { padding: 12px 14px; }
        .ss-rh { font-size: var(--fs-1); font-weight: 800; color: var(--color-ink-3); margin-bottom: 6px; }
        .ss-chips { display: flex; flex-wrap: wrap; gap: 6px; }
        .ss-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); border-radius: var(--radius-pill); padding: 5px 11px; font-size: var(--fs-2); cursor: pointer; font-family: var(--font-sans); }
        .ss-eg { font-size: var(--fs-2); color: var(--color-ink-3); line-height: 1.6; margin-top: 12px; word-break: keep-all; }
        .ss-results { overflow-y: auto; padding: 4px 6px 12px; }
        .ss-empty { font-size: var(--fs-3); color: var(--color-ink-2); padding: 20px 14px; text-align: center; word-break: keep-all; }
        .ss-grp { margin-top: 8px; }
        .ss-gh { font-size: var(--fs-1); font-weight: 800; color: var(--color-ink-3); padding: 4px 10px; }
        .ss-row { display: flex; align-items: baseline; gap: 8px; width: 100%; text-align: left; border: none; background: none; padding: 10px 12px; border-radius: var(--radius-sm); cursor: pointer; }
        .ss-row:hover { background: var(--color-card-soft); }
        .ss-lb { font-size: var(--fs-4); font-weight: 700; color: var(--color-ink); }
        .ss-sb { font-size: var(--fs-2); color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}
