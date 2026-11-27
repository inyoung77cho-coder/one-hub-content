// [S47-2] 운영자 '콘텐츠 운영' 화면 — 현장 메모 · 리포트 요점 · 사용자 니즈.
//   ★시스템 진단(시스템 상태·Token·Scheduler·Circuit Breaker·버전·보드 관리)은 설정 > 운영자 뷰에 그대로 둔다.
//     성격이 다르다(진단 vs 콘텐츠). 여기로 옮기지 않는다.
//   진입: 설정 > 운영자 뷰 > '콘텐츠 운영 열기'(결정 4 — 설정 안에 숨김).
//   게이트: middleware ADMIN_ONLY_PAGES(서버 강제, 비관리자 → /pwa) + 아래 클라 확인(이중).
//   집 규칙: 확인하지 못한 값을 단정해서 표시하지 않는다.
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import Link from "next/link";
import TopNav from "../../components/TopNav";
import SegTabs from "../../components/shared/SegTabs";
import SpotOpPanel, { spotStamp, SPOT_BY } from "../../components/input/SpotOpPanel";
import { REPORT_CATS, weekOf, getNoteForWeek, getRecentWeeks, saveReportNote } from "../../lib/reportNotes";

const TABS = [
  { key: "spot", label: "현장 메모" },
  { key: "report", label: "리포트 요점" },
  { key: "needs", label: "사용자 니즈" },
];
// 리포트 요점은 운영자 본인(tenant A) 기록이다 — 운영자 A/B 조회 전환과 무관하게 A 로 고정.
const OWNER = "A";

const won = (n) => Number(n || 0).toLocaleString("ko-KR");
const eok = (m) => {
  const v = Number(m || 0) / 10000;
  return v >= 1 ? `${v.toFixed(2).replace(/\.00$/, "")}억` : `${won(m)}만`;
};
const KIND = { report: "신고가", listing: "매물호가", rumor: "소문" };
const SRC = { kakao: "카카오톡", sns: "SNS", naver: "네이버", manual: "수동" };

export default function OperatorPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState(null); // null=확인중 | true | false
  const [tab, setTab] = useState(0);

  // 운영자 확인(미들웨어가 이미 막지만 클라에서도 확인 → 비관리자는 /pwa)
  useEffect(() => {
    let dead = false;
    fetch("/api/auth/me").then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (dead) return;
      const ok = !!(d && d.authenticated && d.user && d.user.role === "admin");
      setAllowed(ok);
      if (!ok) router.replace("/pwa");
    }).catch(() => { if (!dead) { setAllowed(false); router.replace("/pwa"); } });
    return () => { dead = true; };
  }, [router]);

  if (allowed !== true) {
    return (
      <div className="m pwa-shell">
        <Head><title>콘텐츠 운영 · ONE-HUB</title><meta name="robots" content="noindex" /></Head>
        <TopNav active="settings" />
        <p style={{ padding: 24, color: "var(--color-ink-3)" }}>{allowed === false ? "운영자만 볼 수 있습니다." : "확인 중…"}</p>
      </div>
    );
  }

  return (
    <div className="m pwa-shell">
      <Head><title>콘텐츠 운영 · ONE-HUB</title><meta name="robots" content="noindex" /></Head>
      <TopNav active="settings" />
      <header className="hd">
        <div>
          <h1>콘텐츠 운영</h1>
          <Link href="/pwa/settings" className="back">← 설정</Link>
        </div>
        {/* 지금 어느 역할로 보고 있는지 — 대표님은 사용자·운영자 두 역할을 오간다 */}
        <span className="badge" aria-label="현재 역할: 운영자">🛠 운영자 모드</span>
      </header>

      <div className="tabs"><SegTabs items={TABS} index={tab} onChange={setTab} ariaLabel="콘텐츠 운영" /></div>

      {tab === 0 && <SpotTab />}
      {tab === 1 && <ReportTab />}
      {tab === 2 && <NeedsTab />}

      <style jsx>{`
        .m { max-width: 560px; margin: 0 auto; padding: 0 14px 90px; color: var(--color-ink); }
        .hd { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 0 10px; }
        h1 { margin: 0; font-size: var(--fs-6, 22px); font-weight: 800; }
        .hd :global(.back) { font-size: var(--fs-2, 13px); color: var(--color-ink-3); text-decoration: none; }
        .badge { flex: none; font-size: var(--fs-2, 13px); font-weight: 800; padding: 6px 10px; border-radius: 999px; background: var(--color-warning-soft); color: var(--color-warning-ink); border: 1px solid var(--color-warning, #d97706); white-space: nowrap; }
        .tabs { margin-bottom: 12px; }
      `}</style>
    </div>
  );
}

// ── S47-3 현장 메모 ───────────────────────────────────────────
function SpotTab() {
  const [cx, setCx] = useState("");
  const [shown, setShown] = useState("");      // 지금 보여주는 조회어
  const [items, setItems] = useState(null);    // null=조회 전 | [] | [...]
  const [err, setErr] = useState("");

  const load = useCallback(async (name) => {
    const q = String(name || "").trim();
    if (!q) return;
    setErr(""); setShown(q); setItems(null);
    try {
      const r = await fetch(`/api/input/re-spot?complex_name=${encodeURIComponent(q)}`);
      const d = await r.json();
      if (!r.ok || d.ok === false) { setErr("기록을 불러오지 못했습니다."); setItems([]); return; }
      const list = Array.isArray(d.items) ? d.items.slice() : [];
      list.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || ""))); // 최신이 위
      setItems(list);
    } catch { setErr("기록을 불러오지 못했습니다."); setItems([]); }
  }, []);

  return (
    <section>
      <div className="card">
        <div className="k">신고가 · 속보 입력</div>
        {/* settings.js 운영자 뷰에 있던 안내 문구 그대로(S47-3: 새로 쓰지 않음) */}
        <p className="lead">정보원 반영이 늦는 부동산 신고가·매물호가를 수시로 입력합니다. 확정 실거래와 분리 저장되며 엔진에는 반영되지 않습니다.</p>
        <SpotOpPanel onSaved={(name) => { setCx(name); load(name); }} />
        <p className="sub">기록은 추가만 됩니다. 고칠 내용이 있으면 새 기록으로 남겨 주세요 — 쌓인 순서가 곧 추세입니다.</p>
      </div>

      <div className="card">
        <div className="k">쌓인 기록</div>
        <div className="row">
          <input value={cx} onChange={(e) => setCx(e.target.value)} placeholder="입력할 때 쓴 단지 · 면적 그대로" onKeyDown={(e) => { if (e.key === "Enter") load(cx); }} />
          <button type="button" onClick={() => load(cx)}>보기</button>
        </div>
        <p className="sub">서버가 단지 이름별 조회만 지원해 입력 때 쓴 이름과 같아야 찾습니다. 미확정 기록만 보입니다.</p>
        {err && <p className="err">{err}</p>}
        {shown && items === null && <p className="sub">불러오는 중…</p>}
        {shown && items && items.length === 0 && !err && <p className="sub">‘{shown}’ 기록이 없습니다.</p>}
        {items && items.length > 0 && (
          <ul className="tl">
            {items.map((s) => {
              const day = String(s.created_at || "").slice(0, 10);
              return (
                <li key={s.id}>
                  <div className="tl-top">
                    <span className="kind">{KIND[s.kind] || s.kind}</span>
                    <b>{s.complex_name}{s.area_m2 ? ` ${s.area_m2}㎡` : ""}</b>
                    <span className="px">{eok(s.price_manwon)}</span>
                  </div>
                  <div className="tl-meta">
                    {day ? spotStamp(day) : `날짜 확인 안 됨 · ${SPOT_BY} · 미확정`}
                    {s.source ? ` · 출처 ${SRC[s.source] || s.source}` : ""}
                    {s.reporter ? ` · 입력 ${s.reporter}` : ""}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <style jsx>{`
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-lg, 14px); padding: 14px; margin-bottom: 12px; }
        .k { font-weight: 800; font-size: var(--fs-4, 15px); }
        .lead { font-size: 0.8rem; color: var(--color-ink-2); margin: 6px 0 4px; line-height: 1.6; }
        .sub { font-size: var(--fs-1, 12px); color: var(--color-ink-3); margin: 8px 0 0; line-height: 1.5; }
        .err { font-size: var(--fs-2, 13px); color: var(--color-danger); margin: 8px 0 0; }
        .row { display: flex; gap: 8px; margin-top: 10px; }
        .row input { flex: 1; min-width: 0; padding: 10px 12px; border: 1.5px solid var(--color-line); border-radius: 10px; font-size: 15px; font-family: inherit; background: var(--color-bg); color: var(--color-ink); }
        .row button { flex: none; padding: 0 16px; border: none; border-radius: 10px; background: var(--color-primary); color: var(--color-on-primary, #fff); font-weight: 700; font-family: inherit; cursor: pointer; }
        .tl { list-style: none; padding: 0; margin: 10px 0 0; }
        .tl li { padding: 10px 0; border-top: 1px solid var(--color-line); }
        .tl-top { display: flex; align-items: center; gap: 8px; font-size: var(--fs-3, 14px); flex-wrap: wrap; }
        .kind { font-size: 11px; font-weight: 700; padding: 2px 7px; border-radius: 99px; background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .px { margin-left: auto; font-weight: 800; }
        .tl-meta { font-size: var(--fs-1, 12px); color: var(--color-ink-3); margin-top: 3px; }
      `}</style>
    </section>
  );
}

// ── S47-4 리포트 요점 ───────────────────────────────────────────
function ReportTab() {
  const wk = weekOf();
  const [cats, setCats] = useState({});
  const [memo, setMemo] = useState("");        // 이번 입력분만. 저장된 출처 메모는 다시 보여주지 않는다.
  const [hasMemo, setHasMemo] = useState(false);
  const [rows, setRows] = useState([]);
  const [msg, setMsg] = useState("");

  const refresh = useCallback(() => {
    const cur = getNoteForWeek(OWNER, wk);
    const init = {};
    REPORT_CATS.forEach(({ key }) => { init[key] = (cur && cur.cats && cur.cats[key]) || ""; });
    setCats(init);
    setHasMemo(!!(cur && cur.hasSourceMemo));
    setRows(getRecentWeeks(OWNER, 8));
  }, [wk]);

  useEffect(() => {
    refresh();
    // 다른 기기에서 동기화돼 들어오면 다시 읽는다
    const on = () => refresh();
    window.addEventListener("onehub-sync-ready", on);
    return () => window.removeEventListener("onehub-sync-ready", on);
  }, [refresh]);

  const save = () => {
    const r = saveReportNote({ trader: OWNER, wk, cats, sourceMemo: memo });
    if (!r.ok) { setMsg(r.error); return; }
    setMemo(""); setMsg("저장했습니다."); refresh();
  };

  return (
    <section>
      <div className="card">
        <div className="khead"><span className="k">이번 주 요점 · {wk} 주</span><span className="lock">🔒 나만 봄</span></div>
        <p className="sub">범주마다 한 줄. 몇 달 뒤 같은 칸끼리 비교할 수 있게 자유 서술 대신 칸을 고정합니다.</p>
        {REPORT_CATS.map(({ key, label }) => (
          <label className="fld" key={key}>
            <span>{label}</span>
            <input value={cats[key] || ""} maxLength={200} onChange={(e) => setCats({ ...cats, [key]: e.target.value })} placeholder="한 줄" />
          </label>
        ))}
        <label className="fld">
          <span>출처 메모 <em>저장만 · 화면에 다시 표시하지 않음</em></span>
          <input value={memo} maxLength={300} onChange={(e) => setMemo(e.target.value)} placeholder={hasMemo ? "이번 주 출처 메모 저장됨 — 새로 쓰면 바뀝니다" : "어느 리포트에서 봤는지"} autoComplete="off" />
        </label>
        <button type="button" className="btn" onClick={save}>저장</button>
        {msg && <p className="sub" role="status">{msg}</p>}
      </div>

      <div className="card">
        <div className="khead"><span className="k">범주별 추세 · 최근 8주</span><span className="lock">🔒 나만 봄</span></div>
        <div className="tw">
          <table>
            <thead><tr><th>주</th>{REPORT_CATS.map(({ key, label }) => <th key={key}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map(({ weekOf: w, note }) => (
                <tr key={w}>
                  <td className="wk">{w.slice(5)}</td>
                  {REPORT_CATS.map(({ key }) => <td key={key}>{(note && note.cats && note.cats[key]) || <span className="na">—</span>}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="sub">빈 칸(—)은 그 주에 적지 않은 것입니다. 값을 채워 넣지 않습니다.</p>
      </div>
      <style jsx>{`
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-lg, 14px); padding: 14px; margin-bottom: 12px; }
        .khead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .k { font-weight: 800; font-size: var(--fs-4, 15px); }
        .lock { flex: none; font-size: var(--fs-1, 12px); font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border: 1px solid var(--color-line); border-radius: 999px; padding: 3px 9px; white-space: nowrap; }
        .sub { font-size: var(--fs-1, 12px); color: var(--color-ink-3); margin: 8px 0 0; line-height: 1.5; }
        .fld { display: block; margin-top: 12px; }
        .fld span { display: block; font-size: 12.5px; font-weight: 700; color: var(--color-ink-2); margin-bottom: 5px; }
        .fld em { font-style: normal; font-weight: 500; color: var(--color-ink-3); margin-left: 6px; }
        .fld input { width: 100%; box-sizing: border-box; padding: 11px 12px; border: 1.5px solid var(--color-line); border-radius: 10px; font-size: 15px; font-family: inherit; background: var(--color-bg); color: var(--color-ink); }
        .btn { display: block; width: 100%; margin-top: 14px; padding: 12px; border: none; border-radius: 12px; background: var(--color-primary); color: var(--color-on-primary, #fff); font-weight: 700; font-size: 15px; font-family: inherit; cursor: pointer; }
        .tw { overflow-x: auto; margin-top: 10px; }
        table { width: 100%; border-collapse: collapse; font-size: var(--fs-2, 13px); }
        th, td { text-align: left; vertical-align: top; padding: 8px 6px; border-top: 1px solid var(--color-line); overflow-wrap: anywhere; }
        th { font-size: var(--fs-1, 12px); color: var(--color-ink-3); font-weight: 700; border-top: none; }
        .wk { white-space: nowrap; color: var(--color-ink-3); width: 1%; }
        .na { color: var(--color-ink-3); }
      `}</style>
    </section>
  );
}

// ── S47-5 사용자 니즈(빈 상태만) ─────────────────────────────────
//   행동 로그(S48)가 아직 없다. 없는 데이터를 있는 것처럼 만들지 않는다.
function NeedsTab() {
  return (
    <section>
      <div className="card">
        <div className="k">사용자 니즈</div>
        <p className="empty">아직 데이터가 없습니다 — 행동 로그를 켜고 2주가 지나야 집계가 생깁니다</p>
        <div className="rule">
          <div className="rk">집계 규칙</div>
          <ul>
            <li>단지 단위로만 묶습니다</li>
            <li>5명 이상 모인 단지만 보입니다</li>
            <li>개인 단위로는 보이지 않습니다</li>
          </ul>
        </div>
        <div className="ex" aria-label="모습 예시 — 실제 데이터 아님">
          <div className="exh">모습 예시 <span className="tag">실제 데이터 아님</span></div>
          <div className="exrow"><span>○○단지</span><span>관심 사용자 ○명 · 많이 본 화면 ○○</span></div>
        </div>
      </div>
      <style jsx>{`
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-lg, 14px); padding: 14px; margin-bottom: 12px; }
        .k { font-weight: 800; font-size: var(--fs-4, 15px); }
        .empty { margin: 14px 0; padding: 18px 12px; text-align: center; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 10px; font-size: var(--fs-3, 14px); line-height: 1.6; }
        .rule { font-size: var(--fs-2, 13px); color: var(--color-ink-2); }
        .rk { font-weight: 700; margin-bottom: 4px; }
        .rule ul { margin: 0; padding-left: 18px; line-height: 1.7; }
        .ex { margin-top: 14px; border: 1.5px dashed var(--color-line); border-radius: 10px; padding: 10px 12px; opacity: .75; }
        .exh { font-size: var(--fs-1, 12px); font-weight: 700; color: var(--color-ink-3); display: flex; align-items: center; gap: 6px; }
        .tag { font-size: 11px; font-weight: 800; color: var(--color-danger); border: 1px solid var(--color-danger); border-radius: 999px; padding: 1px 7px; }
        .exrow { display: flex; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: var(--fs-2, 13px); color: var(--color-ink-3); flex-wrap: wrap; }
      `}</style>
    </section>
  );
}
