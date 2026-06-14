import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function History() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [trader, setTrader] = useState("A");
  const [ok, setOk] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pwa-history?trader=${trader}&limit=30`)
      .then(r => r.json())
      .then(d => {
        setItems(d.items || []);
        setOk(d.ok !== false);
        setLoading(false);
      })
      .catch(() => { setOk(false); setLoading(false); });
  }, [trader]);

  const confColor = (c) => {
    if (c === "HIGH")   return "#0F6E56";
    if (c === "MEDIUM") return "#B8860B";
    return "#8A7E6A";
  };
  const actionColor = (a) => {
    if (a === "BUY")  return "#0F6E56";
    if (a === "SELL") return "#A32D2D";
    return "#8A7E6A";
  };
  const actionLabel = (a) => {
    if (a === "BUY")  return "🟢 매수";
    if (a === "SELL") return "🔴 매도";
    return "⚪ 관망";
  };
  const regimeLabel = (r) => {
    if (r === "BULL")     return "상승장";
    if (r === "BEAR")     return "하락장";
    if (r === "SIDEWAYS") return "횡보장";
    return r || "-";
  };

  const cardStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "1.25rem",
    marginBottom: "0.75rem",
  };
  const muted = { color: "var(--color-muted)", fontSize: "0.85rem" };
  const mono = { fontFamily: "Space Mono, monospace" };

  return (
    <>
      <Head>
        <title>AI 분석 히스토리 — ONE-HUB</title>
        <meta name="description" content="ONE-HUB AI 분석 기록" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div className="page-wrapper">
        <main className="main">
          <div style={{ marginBottom: "1.5rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              AI 분석 히스토리
            </h1>
            <p style={muted}>AI가 언제, 무엇을, 왜 분석했는지 기록입니다</p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
            {["A", "B"].map(t => (
              <button key={t} onClick={() => setTrader(t)} style={{
                padding: "0.4rem 1.2rem", borderRadius: "6px",
                border: "1px solid var(--color-border)",
                background: trader === t ? "var(--color-accent)" : "transparent",
                color: trader === t ? "#fff" : "var(--color-text)",
                cursor: "pointer", ...mono,
                fontSize: "0.85rem", fontWeight: trader === t ? 700 : 400,
              }}>Trader {t}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ ...muted, padding: "3rem 0", ...mono }}>Loading...</div>
          ) : !ok ? (
            <div style={{ color: "#A32D2D", ...mono }}>데이터를 불러올 수 없습니다.</div>
          ) : items.length === 0 ? (
            <div style={muted}>아직 분석 기록이 없습니다.</div>
          ) : (
            items.map((item, i) => (
              <div key={i} style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: "1.05rem", marginRight: "0.5rem" }}>{item.stock}</span>
                    <span style={{ color: actionColor(item.action), fontWeight: 700 }}>{actionLabel(item.action)}</span>
                  </div>
                  <div style={{ ...mono, ...muted, fontSize: "0.78rem" }}>{item.date}</div>
                </div>

                <div style={{ display: "flex", gap: "1rem", marginBottom: "0.5rem", flexWrap: "wrap", ...mono, fontSize: "0.78rem" }}>
                  <span>점수 <strong>{item.ai_score}pt</strong></span>
                  <span style={{ color: confColor(item.confidence) }}>신뢰도 {item.confidence}</span>
                  <span>시장 {regimeLabel(item.global_risk)}</span>
                  {item.key_signal && <span style={muted}>신호: {item.key_signal}</span>}
                </div>

                <div style={{ fontSize: "0.85rem", color: "var(--color-text)" }}>{item.reason}</div>
              </div>
            ))
          )}

          <div style={{ marginTop: "2rem" }}>
            <Link href="/dashboard" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", ...mono }}>
              ← Dashboard
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
