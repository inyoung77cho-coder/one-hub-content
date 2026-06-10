import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function AiAccuracy() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trader, setTrader] = useState("A");

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://54.180.54.132:5001";
    setLoading(true);
    fetch(`${API}/api/ai-accuracy?trader=${trader}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [trader]);

  const confColor = (c) => {
    if (c === "HIGH")   return "#0F6E56";
    if (c === "MEDIUM") return "#B8860B";
    return "#8A7E6A";
  };
  const regimeColor = (r) => {
    if (r === "BULL")     return "#0F6E56";
    if (r === "BEAR")     return "#A32D2D";
    if (r === "SIDEWAYS") return "#B8860B";
    return "#8A7E6A";
  };
  const scoreColor = (s) => {
    if (s >= 75) return "#0F6E56";
    if (s >= 60) return "#B8860B";
    return "#A32D2D";
  };

  const summary    = data?.summary      || {};
  const regimeDist = data?.regime_dist  || [];
  const confDist   = data?.conf_dist    || [];
  const dailyTrend = data?.daily_trend  || [];
  const logs       = data?.logs         || [];
  return (
    <>
      <Head>
        <title>AI Accuracy — ONE-HUB</title>
        <meta name="description" content="ONE-HUB AI 추천 신호 현황 및 통계" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div className="page-wrapper">
        <main className="main">
          <div style={{ marginBottom: "2rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              AI Accuracy Dashboard
            </h1>
            <p style={{ color: "var(--color-muted)", fontSize: "0.9rem" }}>AI 추천 신호 현황 및 통계</p>
          </div>

          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "2rem" }}>
            {["A", "B"].map(t => (
              <button key={t} onClick={() => setTrader(t)} style={{
                padding: "0.4rem 1.2rem", borderRadius: "6px",
                border: "1px solid var(--color-border)",
                background: trader === t ? "var(--color-accent)" : "transparent",
                color: trader === t ? "#fff" : "var(--color-text)",
                cursor: "pointer", fontFamily: "Space Mono, monospace",
                fontSize: "0.85rem", fontWeight: trader === t ? 700 : 400,
              }}>Trader {t}</button>
            ))}
          </div>

          {loading ? (
            <div style={{ color: "var(--color-muted)", fontFamily: "Space Mono, monospace", padding: "3rem 0" }}>Loading...</div>
          ) : !data?.ok ? (
            <div style={{ color: "#A32D2D", fontFamily: "Space Mono, monospace" }}>데이터를 불러올 수 없습니다.</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem", marginBottom: "2.5rem" }}>
                {[
                  { label: "총 추천 건수", value: summary.total ?? 0,     unit: "건" },
                  { label: "BUY 신호",    value: summary.buy_count ?? 0,  unit: "건" },
                  { label: "BUY 비율",    value: summary.buy_rate ?? 0,   unit: "%" },
                  { label: "평균 AI Score", value: summary.avg_score ?? 0, unit: "pt" },
                ].map((card, i) => (
                  <div key={i} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "1.2rem" }}>
                    <div style={{ color: "var(--color-muted)", fontSize: "0.75rem", marginBottom: "0.5rem", fontFamily: "Space Mono, monospace" }}>{card.label}</div>
                    <div style={{ fontSize: "1.8rem", fontWeight: 700, fontFamily: "Syne, sans-serif" }}>
                      {card.value}<span style={{ fontSize: "0.9rem", color: "var(--color-muted)", marginLeft: "2px" }}>{card.unit}</span>
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.5rem", marginBottom: "2.5rem" }}>
                {[
                  { title: "Regime 분포", items: regimeDist, keyF: r => r.regime, countF: r => r.count, colorF: r => regimeColor(r.regime) },
                  { title: "Confidence 분포", items: confDist, keyF: c => c.confidence, countF: c => c.count, colorF: c => confColor(c.confidence) },
                ].map((section, si) => (
                  <div key={si} style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "1.5rem" }}>
                    <h3 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginBottom: "1rem" }}>{section.title}</h3>
                    {section.items.length === 0 ? (
                      <div style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>데이터 없음</div>
                    ) : section.items.map((item, i) => {
                      const total = section.items.reduce((s, x) => s + section.countF(x), 0);
                      const pct = total > 0 ? Math.round(section.countF(item) / total * 100) : 0;
                      return (
                        <div key={i} style={{ marginBottom: "0.75rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.25rem" }}>
                            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: section.colorF(item) }}>{section.keyF(item)}</span>
                            <span style={{ fontFamily: "Space Mono, monospace", fontSize: "0.8rem", color: "var(--color-muted)" }}>{section.countF(item)}건 ({pct}%)</span>
                          </div>
                          <div style={{ background: "var(--color-border)", borderRadius: "4px", height: "6px" }}>
                            <div style={{ width: `${pct}%`, background: section.colorF(item), borderRadius: "4px", height: "6px", transition: "width 0.5s" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "1.5rem", marginBottom: "2.5rem" }}>
                <h3 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginBottom: "1rem" }}>일별 추천 트렌드 (최근 30일)</h3>
                {dailyTrend.length === 0 ? (
                  <div style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>데이터 없음</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Space Mono, monospace", fontSize: "0.8rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["날짜", "추천 건수", "평균 Score"].map(h => (
                            <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "var(--color-muted)", fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {dailyTrend.map((d, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{d.date}</td>
                            <td style={{ padding: "0.5rem 0.75rem" }}>{d.count}건</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: scoreColor(d.avg_score), fontWeight: 700 }}>{d.avg_score}pt</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "10px", padding: "1.5rem" }}>
                <h3 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", marginBottom: "1rem" }}>최근 AI 추천 (최대 50건)</h3>
                {logs.length === 0 ? (
                  <div style={{ color: "var(--color-muted)", fontSize: "0.85rem" }}>데이터 없음</div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "Space Mono, monospace", fontSize: "0.78rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["날짜", "종목", "Action", "Confidence", "Score", "Regime", "Key Signal", "사유"].map(h => (
                            <th key={h} style={{ padding: "0.5rem 0.75rem", textAlign: "left", color: "var(--color-muted)", fontWeight: 400, whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((log, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap", color: "var(--color-muted)" }}>{log.date?.substring(0, 16)}</td>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap", fontWeight: 700 }}>{log.stock}</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: log.action === "BUY" ? "#0F6E56" : "#A32D2D", fontWeight: 700 }}>{log.action}</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: confColor(log.confidence) }}>{log.confidence}</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: scoreColor(log.ai_score), fontWeight: 700 }}>{log.ai_score}pt</td>
                            <td style={{ padding: "0.5rem 0.75rem", color: regimeColor(log.global_risk) }}>{log.global_risk}</td>
                            <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>{log.key_signal}</td>
                            <td style={{ padding: "0.5rem 0.75rem", maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--color-muted)" }} title={log.reason}>{log.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
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
