import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trader, setTrader] = useState("A");

  useEffect(() => {
    setLoading(true);
    fetch(`/api/pwa-dashboard?trader=${trader}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [trader]);

  const regimeColor = (r) => {
    if (r === "BULL")     return "#0F6E56";
    if (r === "BEAR")     return "#A32D2D";
    if (r === "SIDEWAYS") return "#B8860B";
    return "#8A7E6A";
  };
  const regimeLabel = (r) => {
    if (r === "BULL")     return "상승장";
    if (r === "BEAR")     return "하락장";
    if (r === "SIDEWAYS") return "횡보장";
    return r || "분석 중";
  };
  const pnlColor = (v) => {
    if (v > 0) return "#0F6E56";
    if (v < 0) return "#A32D2D";
    return "var(--color-muted)";
  };
  const pnlArrow = (v) => (v > 0 ? "▲" : v < 0 ? "▼" : "➖");
  const signalColor = (s) => {
    if (s === "BUY")  return "#0F6E56";
    if (s === "SELL") return "#A32D2D";
    return "#8A7E6A";
  };
  const signalLabel = (s) => {
    if (s === "BUY")  return "🟢 매수";
    if (s === "SELL") return "🔴 매도";
    return "⚪ 관망";
  };
  const fmt = (n) => {
    if (n === null || n === undefined) return "-";
    return Number(n).toLocaleString();
  };

  const balance = data?.balance || null;
  const market  = data?.market  || null;
  const buys    = data?.today_buys    || [];
  const blocked = data?.today_blocked || [];
  let positions = [];
  try {
    positions = balance?.positions ? JSON.parse(balance.positions) : [];
  } catch (e) {
    positions = [];
  }

  const cardStyle = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "10px",
    padding: "1.5rem",
    marginBottom: "1.5rem",
  };
  const titleStyle = {
    fontFamily: "Syne, sans-serif",
    fontSize: "1rem",
    fontWeight: 700,
    marginBottom: "1rem",
  };
  const muted = { color: "var(--color-muted)", fontSize: "0.85rem" };
  const mono = { fontFamily: "Space Mono, monospace" };

  return (
    <>
      <Head>
        <title>Dashboard — ONE-HUB</title>
        <meta name="description" content="ONE-HUB 오늘의 투자 액션 대시보드" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>
      <div className="page-wrapper">
        <main className="main">
          <div style={{ marginBottom: "1.5rem" }}>
            <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700, marginBottom: "0.5rem" }}>
              ONE-HUB Dashboard
            </h1>
            <p style={muted}>오늘, 무엇을 하면 좋을까요</p>
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
          ) : !data?.ok ? (
            <div style={{ color: "#A32D2D", ...mono }}>데이터를 불러올 수 없습니다.</div>
          ) : (
            <>
              {/* 오늘의 액션 */}
              <div style={cardStyle}>
                <h3 style={titleStyle}>🔥 오늘의 액션</h3>
                <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#0F6E56" }}>{buys.length}</div>
                    <div style={muted}>매수 신호</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#8A7E6A" }}>
                      {blocked.filter(b => b.signal === "HOLD").length}
                    </div>
                    <div style={muted}>관망</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "#A32D2D" }}>
                      {market?.block_count ?? blocked.length}
                    </div>
                    <div style={muted}>차단</div>
                  </div>
                </div>

                {buys.length > 0 ? (
                  buys.map((b, i) => (
                    <div key={i} style={{
                      padding: "0.75rem", borderRadius: "8px",
                      background: "rgba(15,110,86,0.08)",
                      marginBottom: "0.5rem",
                    }}>
                      <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                        🟢 매수 — {b.stock} <span style={{ ...mono, fontSize: "0.8rem", color: "var(--color-muted)" }}>({b.score}pt)</span>
                      </div>
                      <div style={{ ...muted, fontSize: "0.8rem" }}>{b.reason}</div>
                    </div>
                  ))
                ) : (
                  <div style={muted}>오늘은 매수 신호가 없습니다.</div>
                )}
              </div>

              {/* 시장 상태 */}
              <div style={cardStyle}>
                <h3 style={titleStyle}>📈 시장 상태</h3>
                <div style={{ display: "flex", alignItems: "baseline", gap: "0.75rem" }}>
                  <span style={{
                    fontFamily: "Syne, sans-serif", fontSize: "1.4rem", fontWeight: 700,
                    color: regimeColor(market?.regime),
                  }}>
                    {regimeLabel(market?.regime)}
                  </span>
                  <span style={{ ...mono, ...muted }}>
                    오늘 차단 {market?.block_count ?? 0}건
                  </span>
                </div>
              </div>

              {/* 계좌 현황 */}
              <div style={cardStyle}>
                <h3 style={titleStyle}>💰 계좌 현황</h3>
                {balance ? (
                  <>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "1rem", marginBottom: "1rem" }}>
                      <div>
                        <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 700 }}>{fmt(balance.total_asset)}원</div>
                        <div style={muted}>총자산</div>
                      </div>
                      <div>
                        <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 700, color: pnlColor(balance.unrealized_pnl) }}>
                          {pnlArrow(balance.unrealized_pnl)} {fmt(Math.abs(balance.unrealized_pnl))}원
                        </div>
                        <div style={muted}>미실현손익</div>
                      </div>
                      <div>
                        <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 700, color: pnlColor(balance.realized_pnl) }}>
                          {pnlArrow(balance.realized_pnl)} {fmt(Math.abs(balance.realized_pnl))}원
                        </div>
                        <div style={muted}>실현손익</div>
                      </div>
                      <div>
                        <div style={{ ...mono, fontSize: "1.3rem", fontWeight: 700 }}>{fmt(balance.cash)}원</div>
                        <div style={muted}>예수금</div>
                      </div>
                    </div>

                    {positions.length > 0 && (
                      <div style={{ overflowX: "auto" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: "0.8rem" }}>
                          <thead>
                            <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                              {["종목", "수량", "평균가", "현재가", "평가손익"].map(h => (
                                <th key={h} style={{ padding: "0.5rem 0.5rem", textAlign: "left", color: "var(--color-muted)", fontWeight: 400 }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {positions.map((p, i) => (
                              <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                                <td style={{ padding: "0.5rem 0.5rem", fontWeight: 700 }}>{p.name}</td>
                                <td style={{ padding: "0.5rem 0.5rem" }}>{p.qty}</td>
                                <td style={{ padding: "0.5rem 0.5rem" }}>{fmt(p.avg_price)}</td>
                                <td style={{ padding: "0.5rem 0.5rem" }}>{fmt(p.current_price)}</td>
                                <td style={{ padding: "0.5rem 0.5rem", color: pnlColor(p.pnl_amount), fontWeight: 700 }}>
                                  {pnlArrow(p.pnl_amount)} {fmt(Math.abs(p.pnl_amount))} ({p.pnl_rate}%)
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    <div style={{ ...muted, marginTop: "0.75rem", fontSize: "0.75rem" }}>
                      마지막 갱신: {balance.updated_at}
                    </div>
                  </>
                ) : (
                  <div style={muted}>계좌 정보를 불러오는 중입니다.</div>
                )}
              </div>

              {/* 오늘의 신호 전체 (관망/차단 포함) */}
              {blocked.length > 0 && (
                <div style={cardStyle}>
                  <h3 style={titleStyle}>🧠 오늘의 AI 신호</h3>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", ...mono, fontSize: "0.78rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                          {["종목", "판단", "점수", "이유"].map(h => (
                            <th key={h} style={{ padding: "0.5rem 0.5rem", textAlign: "left", color: "var(--color-muted)", fontWeight: 400 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {blocked.map((b, i) => (
                          <tr key={i} style={{ borderBottom: "1px solid var(--color-border)" }}>
                            <td style={{ padding: "0.5rem 0.5rem", fontWeight: 700, whiteSpace: "nowrap" }}>{b.stock}</td>
                            <td style={{ padding: "0.5rem 0.5rem", color: signalColor(b.signal), fontWeight: 700, whiteSpace: "nowrap" }}>
                              {signalLabel(b.signal)}
                            </td>
                            <td style={{ padding: "0.5rem 0.5rem" }}>{b.score}pt</td>
                            <td style={{ padding: "0.5rem 0.5rem", color: "var(--color-muted)", maxWidth: "300px" }}>{b.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}

          <div style={{ marginTop: "2rem" }}>
            <Link href="/" style={{ color: "var(--color-muted)", fontSize: "0.85rem", textDecoration: "none", ...mono }}>
              ← Home
            </Link>
          </div>
        </main>
      </div>
    </>
  );
}
