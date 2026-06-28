/**
 * pages/engine.js — ONE-HUB Engine Hub
 * 4섹션: 엔진 상태 / 보유 종목 / 스케줄 타임라인 / 매매 전략
 * 30초마다 자동 갱신 (실시간 폴링)
 */

import { useState, useEffect, useCallback } from "react";
import Head from "next/head";
import { APP_VERSION } from '../lib/version';
import CTABar from '../components/CTABar';

// ────────────────────────────────────────────────────────────
// 스타일 상수
// ────────────────────────────────────────────────────────────
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Noto+Sans+KR:wght@300;400;500;700&display=swap');

  :root {
    --bg:        #F8F7F2;
    --bg2:       #FFFFFF;
    --bg3:       #F0EDE8;
    --border:    #E0DDD4;
    --border2:  #2a3344;
    --green:     #00AA55;
    --green-dim: #E8F8EF;
    --red:       #DD3333;
    --red-dim:   #FDEAEA;
    --yellow:    #CC8800;
    --yellow-dim:#3d3200;
    --blue:     #4fa3e0;
    --blue-dim: #0d2540;
    --text:      #1A1A1A;
    --text2:     #6A6660;
    --text3:     #9A9690;
    --mono:     'Space Mono', monospace;
    --sans:     'Noto Sans KR', sans-serif;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    background: var(--bg);
    color: var(--text);
    font-family: var(--sans);
    font-weight: 400;
    -webkit-font-smoothing: antialiased;
  }

  .page {
    min-height: 100vh;
    padding: 0 0 80px;
  }

  /* ── 헤더 ── */
  .header {
    border-bottom: 1px solid var(--border);
    padding: 20px 32px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--bg2);
    position: sticky;
    top: 0;
    z-index: 100;
    backdrop-filter: blur(8px);
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .logo {
    font-family: var(--mono);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: var(--text2);
    text-decoration: none;
  }
  .logo span { color: var(--green); }
  .page-title {
    font-family: var(--mono);
    font-size: 11px;
    letter-spacing: 0.2em;
    color: var(--text3);
    text-transform: uppercase;
  }
  .header-right {
    display: flex;
    align-items: center;
    gap: 12px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text3);
  }
  .pulse-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: var(--green);
    animation: pulse 2s infinite;
    flex-shrink: 0;
  }
  .pulse-dot.offline { background: var(--red); animation: none; }
  @keyframes pulse {
    0%,100% { opacity: 1; box-shadow: 0 0 0 0 rgba(0,208,132,.4); }
    50%      { opacity: .7; box-shadow: 0 0 0 5px rgba(0,208,132,0); }
  }

  /* ── 그리드 레이아웃 ── */
  .grid {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: auto auto;
    gap: 20px;
  }
  @media (max-width: 768px) {
    .grid { grid-template-columns: 1fr; padding: 16px; gap: 14px; }
    .header { padding: 14px 16px; }
  }

  /* ── 카드 공통 ── */
  .card {
    background: var(--bg2);
    border: 1px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
    transition: border-color .2s;
  }
  .card:hover { border-color: var(--border2); }
  .card-header {
    padding: 16px 20px 14px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .card-title {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.15em;
    text-transform: uppercase;
    color: var(--text2);
  }
  .card-badge {
    font-family: var(--mono);
    font-size: 10px;
    padding: 3px 8px;
    border-radius: 4px;
    font-weight: 700;
    letter-spacing: 0.05em;
  }
  .badge-green { background: var(--green-dim); color: var(--green); }
  .badge-red   { background: var(--red-dim);   color: var(--red); }
  .badge-gray  { background: var(--bg3);        color: var(--text3); }
  .card-body { padding: 20px; }

  /* ── 1. 엔진 상태 카드 ── */
  .engine-main {
    display: flex;
    align-items: center;
    gap: 20px;
    margin-bottom: 20px;
  }
  .engine-orb {
    width: 64px; height: 64px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 26px;
    flex-shrink: 0;
    position: relative;
  }
  .engine-orb.on {
    background: var(--green-dim);
    box-shadow: 0 0 0 6px rgba(0,208,132,.08), 0 0 24px rgba(0,208,132,.2);
    animation: orb-pulse 3s ease-in-out infinite;
  }
  .engine-orb.off {
    background: var(--red-dim);
  }
  @keyframes orb-pulse {
    0%,100% { box-shadow: 0 0 0 6px rgba(0,208,132,.08), 0 0 24px rgba(0,208,132,.2); }
    50%      { box-shadow: 0 0 0 10px rgba(0,208,132,.04), 0 0 40px rgba(0,208,132,.3); }
  }
  .engine-info h2 {
    font-family: var(--mono);
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .engine-info h2.on  { color: var(--green); }
  .engine-info h2.off { color: var(--red); }
  .engine-info p {
    font-size: 12px;
    color: var(--text2);
    font-family: var(--mono);
  }
  .engine-meta {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .meta-item {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
  }
  .meta-label {
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.15em;
    color: var(--text3);
    text-transform: uppercase;
    margin-bottom: 5px;
  }
  .meta-value {
    font-family: var(--mono);
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
  }
  .meta-value.green { color: var(--green); }

  /* ── 2. 보유 종목 카드 ── */
  .holding-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 0;
    border-bottom: 1px solid var(--border);
    gap: 12px;
  }
  .holding-row:last-child { border-bottom: none; padding-bottom: 0; }
  .holding-name {
    font-weight: 500;
    font-size: 14px;
    color: var(--text);
    min-width: 80px;
  }
  .holding-detail {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text2);
    flex: 1;
  }
  .holding-qty {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text3);
    min-width: 50px;
    text-align: right;
  }
  .pnl-dir {
    font-size: 16px;
    width: 28px;
    text-align: center;
  }
  .empty-holdings {
    text-align: center;
    padding: 32px;
    color: var(--text3);
    font-family: var(--mono);
    font-size: 12px;
  }
  .total-row {
    margin-top: 14px;
    padding-top: 14px;
    border-top: 1px solid var(--border2);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .total-label {
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    color: var(--text3);
    text-transform: uppercase;
  }
  .total-value {
    font-family: var(--mono);
    font-size: 15px;
    font-weight: 700;
    color: var(--blue);
  }

  /* ── 3. 스케줄 타임라인 ── */
  .timeline {
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
  }
  .timeline::before {
    content: '';
    position: absolute;
    left: 34px;
    top: 12px; bottom: 12px;
    width: 1px;
    background: var(--border);
  }
  .tl-item {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 7px 0;
    position: relative;
  }
  .tl-time {
    font-family: var(--mono);
    font-size: 11px;
    font-weight: 700;
    width: 40px;
    text-align: right;
    flex-shrink: 0;
    color: var(--text3);
  }
  .tl-dot {
    width: 10px; height: 10px;
    border-radius: 50%;
    flex-shrink: 0;
    position: relative;
    z-index: 1;
    border: 2px solid var(--bg);
  }
  .tl-dot.done  { background: var(--text3); }
  .tl-dot.soon  { background: var(--yellow); box-shadow: 0 0 8px var(--yellow); animation: pulse-yellow 1.5s infinite; }
  .tl-dot.pending { background: var(--border2); }
  @keyframes pulse-yellow {
    0%,100% { box-shadow: 0 0 4px var(--yellow); }
    50%      { box-shadow: 0 0 12px var(--yellow); }
  }
  .tl-label {
    font-size: 12px;
    font-weight: 500;
    flex: 1;
  }
  .tl-item.done .tl-label  { color: var(--text3); text-decoration: line-through; }
  .tl-item.soon .tl-label  { color: var(--yellow); font-weight: 700; }
  .tl-item.pending .tl-label { color: var(--text2); }
  .tl-badge {
    font-family: var(--mono);
    font-size: 9px;
    letter-spacing: 0.05em;
    padding: 2px 6px;
    border-radius: 3px;
  }
  .tl-badge.soon { background: var(--yellow-dim); color: var(--yellow); }

  /* ── 4. 전략 카드 ── */
  .strategy-list {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .strategy-item {
    background: var(--bg3);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 14px 16px;
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 12px;
    align-items: start;
  }
  .strategy-icon { font-size: 22px; line-height: 1; }
  .strategy-name {
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 4px;
  }
  .strategy-desc {
    font-size: 11px;
    color: var(--text2);
    line-height: 1.5;
  }
  .strategy-weight-wrap { text-align: right; }
  .strategy-pct {
    font-family: var(--mono);
    font-size: 18px;
    font-weight: 700;
    color: var(--blue);
  }
  .strategy-pct-label {
    font-family: var(--mono);
    font-size: 9px;
    color: var(--text3);
    margin-top: 2px;
  }
  .weight-bar-bg {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 10px;
    grid-column: 2 / 4;
    overflow: hidden;
  }
  .weight-bar-fill {
    height: 100%;
    background: var(--blue);
    border-radius: 2px;
    transition: width 1s ease;
  }

  /* ── 로딩 / 에러 ── */
  .loading-wrap {
    display: flex; align-items: center; justify-content: center;
    min-height: 200px;
    color: var(--text3);
    font-family: var(--mono);
    font-size: 12px;
    gap: 10px;
  }
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--green);
    border-radius: 50%;
    animation: spin .8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── 오프라인 배너 ── */
  .offline-banner {
    background: var(--red-dim);
    border-bottom: 1px solid var(--red);
    padding: 8px 32px;
    font-family: var(--mono);
    font-size: 11px;
    color: var(--red);
    text-align: center;
    letter-spacing: 0.05em;
  }

  /* ── 푸터 타임스탬프 ── */
  .footer-ts {
    text-align: center;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--text3);
    margin-top: 32px;
    letter-spacing: 0.1em;
  }

  /* ── 네비게이션 링크 ── */
  .nav-links { display: flex; gap: 20px; }
  .nav-link {
    font-family: var(--mono);
    font-size: 11px;
    color: var(--text3);
    text-decoration: none;
    letter-spacing: 0.1em;
    transition: color .15s;
  }
  .nav-link:hover { color: var(--text); }
  .nav-link.active { color: var(--green); }
`;

// ────────────────────────────────────────────────────────────
// 유틸리티
// ────────────────────────────────────────────────────────────
function formatPrice(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("ko-KR") + "원";
}

function getKSTTime(isoStr) {
  if (!isoStr) return "—";
  try {
    return new Date(isoStr).toLocaleString("ko-KR", {
      timeZone: "Asia/Seoul",
      month: "numeric", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return isoStr;
  }
}

// ────────────────────────────────────────────────────────────
// 서브 컴포넌트
// ────────────────────────────────────────────────────────────

function EngineCard({ engine, version }) {
  const isOn = engine?.is_active;
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">⚙ Engine Status</span>
        <span className={`card-badge ${isOn ? "badge-green" : engine?.status === "stopped" ? "badge-gray" : "badge-red"}`}>
          {isOn ? "RUNNING" : engine?.status === "stopped" ? "STOPPED" : "OFFLINE"}
        </span>
      </div>
      <div className="card-body">
        <div className="engine-main">
          <div className={`engine-orb ${isOn ? "on" : "off"}`}>
            {isOn ? "⚡" : "💤"}
          </div>
          <div className="engine-info">

            <h2 className={isOn ? "on" : "off"}>

              {isOn ? "RUNNING" : engine?.status === "stopped" ? "STOPPED" : "OFFLINE"}

            </h2>

            <p style={{ marginBottom: "4px" }}>onehub.service · {version || APP_VERSION}</p>

            {engine?.status === "stopped" && !isOn && (

              <p style={{ fontSize: "11px", color: "var(--yellow)", fontFamily: "var(--mono)" }}>장 마감 후 정상 종료 상태입니다</p>

            )}

            {engine?.status === "offline" && (

              <p style={{ fontSize: "11px", color: "var(--red)", fontFamily: "var(--mono)" }}>서버 응답 없음 — 네트워크 오류</p>

            )}

          </div>
        </div>
        <div className="engine-meta">
          <div className="meta-item" style={{ gridColumn: "1 / -1" }}>
            <div className="meta-label">운영 상태</div>
            <div className={`meta-value ${isOn ? "green" : ""}`} style={{ fontSize: "13px" }}>
              {isOn ? "정상 가동 중" : engine?.status === "stopped" ? "장 마감 후 종료" : "서버 응답 없음"}
            </div>
          </div>
          {isOn && (
          <div className="meta-item" style={{ gridColumn: "1 / -1" }}>
            <div className="meta-label">마지막 시작</div>
            <div className="meta-value" style={{ fontSize: "12px" }}>
              {getKSTTime(engine?.started_at) || "—"}
            </div>
          </div>
          )}
        </div>

        {/* [v9.0] 컴포넌트별 Health Check */}
        <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 16 }}>
          <div style={{ fontSize: 9, fontFamily: 'var(--mono)', letterSpacing: '0.15em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 12 }}>
            Component Health
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Trading Engine', key: 'engine',   check: (d) => d?.is_active },
              { name: 'KIS API',        key: 'kis',      check: (d) => d?.is_active },
              { name: 'Telegram Bot',   key: 'telegram', check: (d) => d?.is_active },
              { name: 'AI Analyzer',    key: 'analyzer', check: (d) => d?.is_active },
              { name: 'Database',       key: 'db',       check: (d) => d?.is_active },
              { name: 'Scheduler',      key: 'scheduler',check: (d) => d?.is_active },
            ].map(c => {
              const status = engine == null ? null : c.key === 'engine' ? isOn : (engine?.components?.[c.key] ?? isOn);
              const icon = status === null ? '🔵' : status ? '🟢' : '🔴';
              const label = status === null ? '확인 중' : status ? '정상' : '오프라인';
              return (
                <div key={c.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                           padding: '8px 12px', background: 'var(--bg3)', borderRadius: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 14 }}>{icon}</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--text)' }}>{c.name}</span>
                  </div>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: status ? 'var(--green)' : status === null ? 'var(--blue)' : 'var(--red)' }}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function HoldingsCard({ holdings }) {
  // 수익률 방향 → 이모지/색
  const dirStyle = (dir) => {
    if (dir === "▲") return { color: "#ff4757" };   // 한국 주식: 상승=빨강
    if (dir === "▼") return { color: "#4fa3e0" };   // 하락=파랑
    return { color: "#8a9ab5" };
  };

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">📦 보유 종목</span>
        <span className="card-badge badge-gray">
          {holdings?.length ?? 0}종목
        </span>
      </div>
      <div className="card-body">
        {!holdings || holdings.length === 0 ? (
          <div className="empty-holdings">보유 종목 없음</div>
        ) : (
          <>
            {holdings.map((h, i) => (
              <div key={i} className="holding-row">
                <span className="holding-name">{h.name}</span>
                <span className="holding-detail">
                  {formatPrice(h.avg_price)}
                </span>
                <span className="holding-qty">{h.qty}주</span>
                <span className="pnl-dir" style={dirStyle(h.pnl_dir)}>
                  {h.pnl_dir || "➖"}
                </span>
              </div>
            ))}
            <div className="total-row">
              <span className="total-label">총 매입금액 (추정)</span>
              <span className="total-value">약 {holdings.reduce((s,h) => s+(h.avg_price*h.qty),0).toLocaleString("ko-KR")}원</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function ScheduleCard({ schedule }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🕐 오늘 스케줄</span>
        <span className="card-badge badge-gray">KST</span>
      </div>
      <div className="card-body">
        <div className="timeline">
          {(schedule || []).map((ev) => (
            <div key={ev.id} className={`tl-item ${ev.status}`}>
              <span className="tl-time">{ev.time_kst}</span>
              <span className={`tl-dot ${ev.status}`} />
              <span className="tl-label">{ev.label}</span>
              {ev.status === "soon" && (
                <span className="tl-badge soon">
                  {ev.diff_minutes}분 후
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StrategyCard({ strategy }) {
  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">🎯 매매 전략</span>
        <span className="card-badge badge-gray">WEIGHT</span>
      </div>
      <div className="card-body">
        <div className="strategy-list">
          {(strategy || []).map((s) => (
            <div key={s.id} className="strategy-item">
              <span className="strategy-icon">{s.icon}</span>
              <div>
                <div className="strategy-name">{s.name}</div>
                <div className="strategy-desc">{s.desc}</div>
              </div>
              <div className="strategy-weight-wrap">
                <div className="strategy-pct">{s.weight}%</div>
                <div className="strategy-pct-label">WEIGHT</div>
              </div>
              <div className="weight-bar-bg">
                <div
                  className="weight-bar-fill"
                  style={{ width: `${s.weight}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// 메인 페이지
// ────────────────────────────────────────────────────────────
export default function EnginePage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [countdown, setCountdown] = useState(30);

  const POLL_SEC = 30;

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/engine-status");
      const json = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setCountdown(POLL_SEC);
    } catch (err) {
      console.error("Fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 최초 로드
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 30초 자동 갱신
  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          fetchData();
          return POLL_SEC;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchData]);

  const isOffline = data?._offline;

  return (
    <>
      <Head>
        <title>Engine Hub — ONE-HUB</title>
        <meta name="description" content="자동매매 엔진 현황 대시보드" />
      </Head>

      <style>{STYLES}</style>

      <div className="page">
        {/* 상태바 */}
        <div className="eng-status-bar">
          <span className="esb-item">ENGINE HUB</span>
          <span className="esb-div">|</span>
          <span className="esb-item">{loading ? "연결 중..." : isOffline ? "⚠ 서버 오프라인" : `${countdown}초 후 갱신`}</span>
          {!isOffline && <span className="esb-dot"></span>}
        </div>

        {/* 오프라인 배너 */}
        {isOffline && (
          <div className="offline-banner">
            ⚠ AWS 서버 응답 없음 — 마지막으로 알려진 상태를 표시합니다
          </div>
        )}

        {/* 그리드 */}
        {loading ? (
          <div className="loading-wrap">
            <div className="spinner" />
            <span>엔진 상태 조회 중...</span>
          </div>
        ) : (
          <main className="grid">
            <EngineCard engine={data?.engine} version={data?.version} />
            <HoldingsCard holdings={data?.holdings} />
            <ScheduleCard schedule={data?.schedule} />
            <StrategyCard strategy={data?.strategy} />
          </main>
        )}

        {/* 타임스탬프 */}
        {lastUpdated && (
          <div className="footer-ts">
            LAST UPDATED ·{" "}
            {lastUpdated.toLocaleString("ko-KR", {
              timeZone: "Asia/Seoul",
              hour: "2-digit", minute: "2-digit", second: "2-digit",
            })}{" "}
            KST
          </div>
        )}

        {/* 바로가기 링크 */}
        <div style={{ display: "flex", gap: "1rem", justifyContent: "center", padding: "1.5rem 0", flexWrap: "wrap" }}>
          <a href="/ai-accuracy" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "var(--color-muted, #8A7E6A)", textDecoration: "none", border: "1px solid #333", borderRadius: "6px", padding: "0.4rem 1rem" }}>
            AI Accuracy →
          </a>
          <a href="/decision-log" style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "var(--color-muted, #8A7E6A)", textDecoration: "none", border: "1px solid #333", borderRadius: "6px", padding: "0.4rem 1rem" }}>
            Decision Log →
          </a>
        </div>
        <div style={{ padding: '0 24px 24px' }}><CTABar /></div>
      </div>
    </>
  );
}
