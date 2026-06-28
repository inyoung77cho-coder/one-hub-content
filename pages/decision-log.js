import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function DecisionLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [dates, setDates] = useState([]);

  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    setSelectedDate(today);
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://54.180.54.132:5001";
    setLoading(true);
    fetch(`${API}/api/decision-log?date=${selectedDate}&limit=200`)
      .then(r => r.json())
      .then(d => { setLogs(d.logs || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [selectedDate]);

  const mlColor = (sig) => {
    if (sig === "BUY") return "#0F6E56";
    if (sig === "SELL") return "#A32D2D";
    return "#8A7E6A";
  };

  const parseErrors = (errStr) => {
    try { return JSON.parse(errStr) || []; }
    catch { return errStr ? [errStr] : []; }
  };

  const grouped = logs.reduce((acc, log) => {
    const time = log.date?.substring(11, 16) || "";
    if (!acc[time]) acc[time] = [];
    acc[time].push(log);
    return acc;
  }, {});

  return (
    <>
      <Head>
        <title>Decision Log — ONE-HUB</title>
        <meta name="description" content="AI가 오늘 왜 차단했는가 — ONE-HUB Decision Log" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main">

          {/* 헤더 */}
          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              Decision Log
            </h1>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              AI가 왜 매수하지 않았는가 — 모든 차단 결정을 투명하게 기록합니다.
            </p>
          </div>

          {/* 날짜 선택 */}
          <div style={{ marginBottom: "1.5rem", display: "flex", alignItems: "center", gap: "12px" }}>
            <label style={{ fontSize: "0.875rem", color: "var(--color-muted)", fontFamily: "Space Mono, monospace" }}>
              날짜 선택
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={e => setSelectedDate(e.target.value)}
              style={{
                padding: "8px 12px", borderRadius: "8px",
                border: "1px solid var(--color-border)",
                fontSize: "0.875rem", fontFamily: "Space Mono, monospace",
                background: "var(--color-surface)", color: "var(--color-text)"
              }}
            />
            <span style={{ fontSize: "0.8rem", color: "var(--color-muted)" }}>
              {loading ? "로딩 중..." : `${logs.length}건 차단`}
            </span>
          </div>

          {/* 요약 카드 */}
          {!loading && logs.length > 0 && (
            <div style={{
              display: "grid", gridTemplateColumns: "repeat(3, 1fr)",
              gap: "0.75rem", marginBottom: "1.5rem"
            }}>
              {[
                { label: "총 차단", value: `${logs.length}건`, color: "#A32D2D" },
                { label: "ML SELL", value: `${logs.filter(l => l.ml_signal === "SELL").length}건`, color: "#BA7517" },
                { label: "평균 Score", value: `${Math.round(logs.reduce((s, l) => s + (l.final_score || 0), 0) / logs.length)}점`, color: "#1A1A1A" },
              ].map(item => (
                <div key={item.label} style={{
                  background: "var(--color-surface)", border: "1px solid var(--color-border)",
                  borderRadius: "12px", padding: "0.875rem", textAlign: "center"
                }}>
                  <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>{item.label}</div>
                  <div style={{ fontSize: "1.25rem", fontWeight: 700, color: item.color }}>{item.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* 로그 목록 */}
          {loading ? (
            <div style={{ fontSize: "0.875rem", color: "var(--color-muted)", padding: "2rem 0" }}>
              데이터 로딩 중...
            </div>
          ) : logs.length === 0 ? (
            <div style={{
              background: "var(--color-surface)", border: "1px solid var(--color-border)",
              borderRadius: "20px", padding: "44px 28px", textAlign: "center",
              boxShadow: "0 2px 16px rgba(0,0,0,0.07)"
            }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "14px" }}>✅</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--color-text)", marginBottom: "10px" }}>
                오늘 차단 종목 없음
              </div>
              <div style={{ fontSize: "14px", color: "var(--color-muted)", lineHeight: 1.8, marginBottom: 16 }}>
                AI가 오늘 시장을 안정적으로<br/>
                판단했습니다.
              </div>
              <div style={{ fontSize: "13px", color: "var(--color-muted)", padding: "12px 16px",
                            background: "#f8fafc", borderRadius: 12, display: "inline-block" }}>
                장중 차단 종목 발생 시<br/>
                이곳에 자동 기록됩니다.
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: 14 }}>
                {selectedDate} · 평일 09:05~15:30
              </div>
            </div>
          ) : (
            <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "14px", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--color-border)", background: "var(--color-bg)" }}>
                    {["시간", "종목", "Score", "ML", "RSI", "차단 이유"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "var(--color-muted)", fontWeight: 600, fontFamily: "Space Mono, monospace", fontSize: "11px" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => {
                    const errors = parseErrors(log.errors);
                    const mainError = errors[0] || "차단";
                    return (
                      <tr
                        key={i}
                        onClick={() => setSelectedLog(selectedLog?.code === log.code && selectedLog?.date === log.date ? null : log)}
                        style={{
                          borderBottom: "1px solid var(--color-border)",
                          cursor: "pointer",
                          background: selectedLog?.code === log.code && selectedLog?.date === log.date
                            ? "var(--color-bg)" : "transparent"
                        }}
                      >
                        <td style={{ padding: "8px 12px", fontFamily: "Space Mono, monospace", color: "var(--color-muted)" }}>
                          {log.date?.substring(11, 16)}
                        </td>
                        <td style={{ padding: "8px 12px", fontWeight: 600 }}>{log.stock}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "Space Mono, monospace" }}>{log.final_score}</td>
                        <td style={{ padding: "8px 12px", color: mlColor(log.ml_signal), fontWeight: 600 }}>{log.ml_signal || "-"}</td>
                        <td style={{ padding: "8px 12px", fontFamily: "Space Mono, monospace" }}>{log.rsi?.toFixed(1)}</td>
                        <td style={{ padding: "8px 12px", color: "var(--color-muted)", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {mainError}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* 상세 패널 */}
          {selectedLog && (
            <div style={{
              marginTop: "1rem", background: "var(--color-surface)",
              border: "1px solid var(--color-border)", borderRadius: "14px", padding: "1.25rem"
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 700, marginBottom: "4px" }}>
                    {selectedLog.stock} ({selectedLog.code})
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--color-muted)", fontFamily: "Space Mono, monospace" }}>
                    {selectedLog.date} · {selectedLog.regime}
                  </div>
                </div>
                <button onClick={() => setSelectedLog(null)} style={{
                  background: "none", border: "none", fontSize: "1.25rem",
                  cursor: "pointer", color: "var(--color-muted)"
                }}>×</button>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px", marginBottom: "1rem" }}>
                {[
                  { label: "Final Score", value: selectedLog.final_score },
                  { label: "ML Signal", value: selectedLog.ml_signal || "-", color: mlColor(selectedLog.ml_signal) },
                  { label: "RSI", value: selectedLog.rsi?.toFixed(1) },
                ].map(item => (
                  <div key={item.label} style={{ background: "var(--color-bg)", borderRadius: "8px", padding: "0.75rem", textAlign: "center" }}>
                    <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px" }}>{item.label}</div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 700, color: item.color || "var(--color-text)" }}>{item.value}</div>
                  </div>
                ))}
              </div>

              <div>
                <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "8px", fontFamily: "Space Mono, monospace" }}>
                  차단 사유
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {parseErrors(selectedLog.errors).map((err, i) => (
                    <div key={i} style={{
                      background: "#FCEBEB", border: "1px solid #F09595",
                      borderRadius: "8px", padding: "8px 12px",
                      fontSize: "0.8rem", color: "#791F1F"
                    }}>
                      🚫 {err}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}