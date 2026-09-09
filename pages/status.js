// [S33-5] 공개 상태 페이지 — 로그인 없이. 지인이 "앱이 안 돼요" 할 때 보낼 링크.
//   /api/health 를 사람이 읽는 화면으로. ★내부 IP·포트·에러 문자열 노출 금지 — 상태만.
//   30초 자동 새로고침. 랜딩(하단탭·헤더 아이콘 없음).
import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { SERVICE_KO } from "../lib/backendHealth";

// 표시 순서(사용자 언어). health 응답에 없는 서비스는 건너뛴다.
const ORDER = ["engine", "realestate", "etf", "news"];

function fmtKST(iso) {
  if (!iso) return "-";
  try {
    const d = new Date(iso);
    const p = (n) => String(n).padStart(2, "0");
    // Asia/Seoul(UTC+9)
    const k = new Date(d.getTime() + 9 * 3600 * 1000);
    return `${k.getUTCFullYear()}-${p(k.getUTCMonth() + 1)}-${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
  } catch (e) { return "-"; }
}

export default function StatusPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/health", { cache: "no-store" });
      const d = await r.json();
      setData(d); setUnreachable(false);
    } catch (e) { setUnreachable(true); }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // 30초 자동 새로고침
    return () => clearInterval(t);
  }, [load]);

  const byName = {};
  (data?.services || []).forEach((s) => { byName[s.name] = s; });
  const services = ORDER.filter((n) => byName[n]).map((n) => ({ key: n, ko: SERVICE_KO[n] || n, up: byName[n].up }));

  return (
    <>
      <Head>
        <title>ONE·HUB 상태</title>
        <meta name="description" content="ONE·HUB 서비스 상태 — 주식 엔진·부동산·ETF·뉴스." />
        <meta name="robots" content="noindex" />
      </Head>
      <div className="st">
        <div className="st-card">
          <h1 className="st-h">ONE·HUB 상태</h1>

          {loading ? (
            <div className="st-loading">확인하는 중…</div>
          ) : unreachable ? (
            <div className="st-unreach">지금 상태를 확인할 수 없습니다 — 잠시 후 다시 시도해 주세요.</div>
          ) : (
            <>
              <ul className="st-list">
                {services.map((s) => (
                  <li className="st-row" key={s.key}>
                    <span className={`st-dot ${s.up ? "up" : "down"}`} aria-hidden="true" />
                    <span className={`st-state ${s.up ? "up" : "down"}`}>{s.up ? "정상" : "점검 중"}</span>
                    <span className="st-name">{s.ko}</span>
                  </li>
                ))}
              </ul>
              <div className="st-foot">마지막 확인 {fmtKST(data?.ts)} · 30초마다 자동 새로고침</div>
            </>
          )}
        </div>
        <a className="st-back" href="/pwa">앱으로 돌아가기 →</a>
      </div>

      <style jsx>{`
        .st { min-height: 100vh; background: var(--color-bg, #F4F9FF); display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 16px; padding: 24px 18px;
          font-family: var(--font-sans, system-ui, sans-serif); color: var(--color-ink, #12213B); }
        .st-card { width: 100%; max-width: 420px; background: var(--color-card, #fff);
          border: 1px solid var(--color-line, #E8EEF7); border-radius: 18px; box-shadow: var(--shadow-card, 0 2px 10px rgba(0,0,0,.05));
          padding: 26px 24px; }
        .st-h { font-size: 20px; font-weight: 800; margin: 0 0 18px; letter-spacing: -.3px; }
        .st-loading, .st-unreach { font-size: 14px; color: var(--color-ink-2, #475569); line-height: 1.6; word-break: keep-all; }
        .st-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
        .st-row { display: flex; align-items: center; gap: 12px; }
        .st-dot { width: 11px; height: 11px; border-radius: 50%; flex: none; }
        .st-dot.up { background: var(--color-success, #16a34a); }
        .st-dot.down { background: var(--color-ink-3, #94a3b8); }
        .st-state { font-size: 13px; font-weight: 700; width: 52px; flex: none; }
        .st-state.up { color: var(--color-success, #16a34a); }
        .st-state.down { color: var(--color-ink-3, #94a3b8); }
        .st-name { font-size: 15px; font-weight: 700; color: var(--color-ink, #12213B); }
        .st-foot { margin-top: 20px; padding-top: 14px; border-top: 1px solid var(--color-line, #E8EEF7);
          font-size: 12px; color: var(--color-ink-3, #8593A8); }
        .st-back { font-size: 13px; font-weight: 700; color: var(--color-primary, #2F6BFF); text-decoration: none; }
      `}</style>
    </>
  );
}
