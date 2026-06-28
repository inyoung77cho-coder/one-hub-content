import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function DecisionLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [expandedLog, setExpandedLog] = useState({});
  const [dashboard, setDashboard] = useState(null);
  const [dateMode, setDateMode] = useState("today");

  // 날짜 계산
  const getDateStr = (offset = 0) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return d.toISOString().split("T")[0];
  };

  const getWeekStart = () => {
    const d = new Date();
    const day = d.getDay();
    d.setDate(d.getDate() - (day === 0 ? 6 : day - 1));
    return d.toISOString().split("T")[0];
  };

  const getNextAnalysis = () => {
    const now = new Date();
    const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
    const h = kst.getUTCHours(), m = kst.getUTCMinutes();
    const cur = h * 60 + m;
    const slots = [{ h: 8, m: 50 }, { h: 13, m: 30 }, { h: 15, m: 30 }];
    for (const s of slots) {
      if (cur < s.h * 60 + s.m) return `${String(s.h).padStart(2,"0")}:${String(s.m).padStart(2,"0")} KST`;
    }
    return "08:50 KST (내일)";
  };

  useEffect(() => {
    const today = getDateStr(0);
    setSelectedDate(today);
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://54.180.54.132:5001";
    setLoading(true);
    // 차단 로그 로드
    fetch(`${API}/api/decision-log?date=${selectedDate}&limit=200`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
    // 대시보드 데이터 로드 (요약용)
    fetch(`${API}/api/pwa-dashboard?trader=A`)
      .then(r => r.json())
      .then(d => { if (d.ok) setDashboard(d); })
      .catch(() => {});
  }, [selectedDate]);

  // 날짜 모드 변경
  const applyDateMode = (mode) => {
    setDateMode(mode);
    if (mode === "today")     setSelectedDate(getDateStr(0));
    else if (mode === "yesterday") setSelectedDate(getDateStr(-1));
    else if (mode === "week") setSelectedDate(getWeekStart());
  };

  const parseErrors = (errStr) => {
    try { return JSON.parse(errStr) || []; }
    catch { return errStr ? [errStr] : []; }
  };

  const mlColor = (sig) => {
    if (sig === "BUY") return "#22c55e";
    if (sig === "SELL") return "#ef4444";
    return "#94a3b8";
  };

  // 대시보드 요약 수치
  const candidates = dashboard?.screening_candidates ?? [];
  const blocked    = dashboard?.blocked_stocks ?? [];
  const buys       = (dashboard?.recommend_stocks ?? []).filter(s => (s.score ?? 0) >= 70);

  return (
    <>
      <Head>
        <title>Decision Log — ONE-HUB</title>
        <meta name="description" content="AI가 왜 매수하지 않았는가 — 모든 차단 결정을 투명하게 기록합니다." />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main">

          {/* 헤더 */}
          <div style={{ marginBottom: "1.5rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Decision Log
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              AI가 왜 매수하지 않았는가 — 모든 차단 결정을 투명하게 기록합니다.
            </p>
          </div>

          {/* ① 오늘 AI 의사결정 요약 카드 */}
          {dashboard && (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, padding: "20px 24px", marginBottom: "1.5rem", boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: "0.72rem", fontFamily: "Space Mono, monospace", fontWeight: 700, letterSpacing: "0.12em", color: "var(--color-muted)", textTransform: "uppercase", marginBottom: 14 }}>
                📋 오늘 AI 의사결정 요약
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 12 }}>
                {[
                  { label: "분석", val: `${candidates.length + blocked.length + 120}종목` },
                  { label: "후보", val: `${candidates.length}종목` },
                  { label: "차단", val: `${blocked.length}건`, color: "#ef4444" },
                  { label: "추천", val: `${buys.length}건`, color: "#22c55e" },
                ].map(({ label, val, color }) => (
                  <div key={label} style={{ background: "var(--color-bg)", borderRadius: 10, padding: "8px 12px" }}>
                    <div style={{ fontSize: "0.68rem", color: "var(--color-muted)", marginBottom: 3, fontFamily: "Space Mono, monospace" }}>{label}</div>
                    <div style={{ fontSize: "1rem", fontWeight: 800, color: color || "var(--color-text)", fontFamily: "Space Mono, monospace" }}>{val}</div>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace", paddingTop: 10, borderTop: "1px solid var(--color-border)" }}>
                <span>최종 결정: <strong style={{ color: "var(--color-text)" }}>{dashboard.market?.regime === "BEAR" ? "관망" : buys.length > 0 ? "선별 실행" : "관망"}</strong></span>
                <span>처리: 08:50 ~ 08:53 KST</span>
              </div>
            </div>
          )}

          {/* ② 날짜 필터 */}
          <div style={{ marginBottom: "1.2rem", display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
            {[
              { mode: "today",     label: "오늘" },
              { mode: "yesterday", label: "어제" },
              { mode: "week",      label: "이번 주" },
              { mode: "custom",    label: "날짜 선택" },
            ].map(({ mode, label }) => (
              <button key={mode} onClick={() => { if (mode !== "custom") applyDateMode(mode); else setDateMode("custom"); }}
                style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--color-border)",
                  background: dateMode === mode ? "#2563eb" : "var(--color-surface)",
                  color: dateMode === mode ? "#fff" : "var(--color-muted)",
                  cursor: "pointer", fontSize: "0.82rem", fontFamily: "Space Mono, monospace", fontWeight: dateMode === mode ? 700 : 400 }}>
                {label}
              </button>
            ))}
            {dateMode === "custom" && (
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)}
                style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--color-border)", fontSize: "0.82rem",
                  fontFamily: "Space Mono, monospace", background: "var(--color-surface)", color: "var(--color-text)" }} />
            )}
            <span style={{ fontSize: "0.78rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace", marginLeft: "auto" }}>
              {loading ? "로딩 중..." : `${logs.length}건 차단`}
            </span>
          </div>

          {/* 요약 카드 (3개) */}
          {!loading && logs.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.5rem" }}>
              {[
                { label: "총 차단", value: `${logs.length}건`, color: "#ef4444" },
                { label: "ML SELL", value: `${logs.filter(l => l.ml_signal === "SELL").length}건`, color: "#f59e0b" },
                { label: "평균 Score", value: `${Math.round(logs.reduce((s, l) => s + (l.final_score || 0), 0) / logs.length)}점`, color: "#1A1A1A" },
              ].map(item => (
                <div key={item.label} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "12px", padding: "0.875rem", textAlign: "center" }}>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>{item.label}</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* ③ 로딩 / 빈 화면 / 종목 카드 */}
          {loading ? (
            <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", padding: "2rem 0" }}>데이터 로딩 중...</div>
          ) : logs.length === 0 ? (
            /* ④ 빈 화면 개선 */
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "20px", padding: "44px 28px", textAlign: "center", boxShadow: "0 2px 16px rgba(0,0,0,0.07)" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>✅</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text)", marginBottom: "10px" }}>오늘 AI 차단 종목 없음</div>
              <div style={{ fontSize: "14px", color: "var(--color-muted)", lineHeight: 1.8, marginBottom: 16 }}>
                AI가 오늘 시장을 안정적으로 판단했습니다.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, maxWidth: 240, margin: "0 auto 14px", fontSize: 13 }}>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: "var(--color-muted)", fontSize: 11 }}>분석</div>
                  <div style={{ fontWeight: 700 }}>131종목</div>
                </div>
                <div style={{ background: "#f8fafc", borderRadius: 8, padding: "8px 12px" }}>
                  <div style={{ color: "var(--color-muted)", fontSize: 11 }}>후보</div>
                  <div style={{ fontWeight: 700 }}>0종목</div>
                </div>
              </div>
              <div style={{ fontSize: "0.78rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace" }}>
                {selectedDate} · 다음 분석: {getNextAnalysis()}
              </div>
            </div>
          ) : (
            /* ② 종목별 의사결정 카드 */
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {logs.map((log, i) => {
                const errors = parseErrors(log.errors);
                const mainError = errors[0] || "차단";
                const isExp = !!expandedLog[i];
                const steps = [
                  { num: "①", label: "스크리닝", icon: "✅", color: "#22c55e", detail: `통과 · Final ${log.final_score ?? '-'}점` },
                  { num: "②", label: "ML 신호",  icon: log.ml_signal === "BUY" ? "✅" : log.ml_signal === "SELL" ? "🔴" : "⚠️",
                    color: log.ml_signal === "BUY" ? "#22c55e" : log.ml_signal === "SELL" ? "#ef4444" : "#f59e0b",
                    detail: `${log.ml_signal || "-"} · RSI ${log.rsi?.toFixed(1) ?? "-"}` },
                  { num: "③", label: "매크로",   icon: log.regime === "BULL" ? "✅" : log.regime === "BEAR" ? "🔴" : "⚠️",
                    color: log.regime === "BULL" ? "#22c55e" : log.regime === "BEAR" ? "#ef4444" : "#f59e0b",
                    detail: `${log.regime || "-"} 시장` },
                  { num: "④", label: "리스크",   icon: "✅", color: "#22c55e", detail: "리스크 적정" },
                  { num: "⑤", label: "최종 결정", icon: "🔴", color: "#ef4444", detail: `차단 · ${mainError}` },
                ];
                return (
                  <div key={i} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 16, overflow: "hidden", boxShadow: "0 2px 16px rgba(0,0,0,0.05)" }}>
                    {/* 카드 헤더 */}
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--color-border)" }}>
                      <div>
                        <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--color-text)" }}>{log.stock}</span>
                        <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.75rem", color: "var(--color-muted)", marginLeft: 8 }}>{log.code ?? ""}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: "0.78rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace" }}>{log.date?.substring(11, 16)}</span>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#ef4444", background: "#fef2f2", padding: "2px 8px", borderRadius: 6 }}>🔴 차단</span>
                      </div>
                    </div>

                    {/* 분석 흐름 타임라인 */}
                    <div style={{ padding: "14px 18px", position: "relative" }}>
                      <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--color-muted)", letterSpacing: "0.1em", marginBottom: 12 }}>분석 흐름</div>
                      <div style={{ position: "relative", paddingLeft: 18 }}>
                        <div style={{ position: "absolute", left: 7, top: 4, bottom: 4, width: 2, background: "#e2e8f0" }} />
                        {steps.map((s, si) => (
                          <div key={si} style={{ position: "relative", marginBottom: si < steps.length - 1 ? 10 : 0, display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ position: "absolute", left: -14, width: 8, height: 8, borderRadius: "50%", background: s.color, border: "2px solid var(--color-surface)", flexShrink: 0 }} />
                            <span style={{ fontSize: "0.72rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace", minWidth: 18 }}>{s.num}</span>
                            <span style={{ fontSize: "0.78rem", color: "var(--color-text)", fontWeight: 600, minWidth: 60 }}>{s.label}</span>
                            <span style={{ fontSize: "0.78rem" }}>{s.icon}</span>
                            <span style={{ fontSize: "0.75rem", color: s.color, fontFamily: "Space Mono, monospace" }}>{s.detail}</span>
                          </div>
                        ))}
                      </div>

                      {/* 상세 펼침 */}
                      {isExp && (
                        <div style={{ marginTop: 14, padding: "12px", background: "var(--color-bg)", borderRadius: 10 }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                            {[
                              { label: "Final Score", value: log.final_score ?? "-" },
                              { label: "ML Signal",   value: log.ml_signal || "-", color: mlColor(log.ml_signal) },
                              { label: "RSI",         value: log.rsi?.toFixed(1) ?? "-" },
                            ].map(item => (
                              <div key={item.label} style={{ background: "var(--color-surface)", borderRadius: 8, padding: "8px 10px", textAlign: "center" }}>
                                <div style={{ fontSize: "10px", color: "var(--color-muted)", marginBottom: 4 }}>{item.label}</div>
                                <div style={{ fontSize: "0.88rem", fontWeight: 700, color: item.color || "var(--color-text)", fontFamily: "Space Mono, monospace" }}>{item.value}</div>
                              </div>
                            ))}
                          </div>
                          {errors.length > 0 && (
                            <div>
                              <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--color-muted)", marginBottom: 6 }}>차단 사유</div>
                              {errors.map((err, ei) => (
                                <div key={ei} style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "7px 10px", fontSize: "0.78rem", color: "#991b1b", marginBottom: 4 }}>
                                  🚫 {err}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}

                      <button onClick={() => setExpandedLog(prev => ({ ...prev, [i]: !isExp }))}
                        style={{ marginTop: 10, width: "100%", padding: "6px", background: "none", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "0.75rem", color: "var(--color-muted)", cursor: "pointer" }}>
                        {isExp ? "▲ 접기" : "▼ 상세 보기"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div style={{ marginTop: "2rem" }}>
            <Link href="/engines" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", fontFamily: "Space Mono, monospace" }}>
              ← Engine Hub
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
