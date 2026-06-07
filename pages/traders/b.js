import Head from "next/head";
import Link from "next/link";
import { useState, useEffect } from "react";

export default function TraderB() {
  const [traderData, setTraderData]   = useState(null);
  const [traderA, setTraderA]         = useState(null);
  const [report, setReport]           = useState(null);
  const [history, setHistory]         = useState(null);
  const [loading, setLoading]         = useState(true);
  const [reportLoading, setReportLoading] = useState(true);

  useEffect(() => {
    const API = process.env.NEXT_PUBLIC_ENGINE_API_URL || "http://54.180.54.132:5001";

    fetch(`${API}/api/engine-status`)
      .then(r => r.json()).then(d => setTraderA(d)).catch(() => {});

    fetch(`${API}/api/engine-status?trader=B`)
      .then(r => r.json()).then(d => { setTraderData(d); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(`${API}/api/trader/B/daily-report`)
      .then(r => r.json()).then(d => { setReport(d); setReportLoading(false); })
      .catch(() => setReportLoading(false));

    fetch(`${API}/api/trader/B/history`)
      .then(r => r.json()).then(d => setHistory(d))
      .catch(() => {});
  }, []);

  const regimeColor = (r) => r === "BULL" ? "#0F6E56" : r === "BEAR" ? "#C0392B" : "#8A7E6A";
  const regimeEmoji = (r) => r === "BULL" ? "▲" : r === "BEAR" ? "▼" : "➖";
  const pnlColor    = (v) => v > 0 ? "#0F6E56" : v < 0 ? "#C0392B" : "#8A7E6A";

  return (
    <>
      <Head>
        <title>Trader B — ONE-HUB</title>
        <meta name="description" content="ONE-HUB Trader B 현황 — AI 판단 근거와 거래 성과" />
        <link href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Syne:wght@400;600;700&display=swap" rel="stylesheet" />
      </Head>

      <div className="page-wrapper">
        <main className="main">

          {/* 헤더 */}
          <div style={{ marginBottom: "2rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "0.5rem" }}>
              <h1 style={{ fontFamily: "Syne, sans-serif", fontSize: "1.75rem", fontWeight: 700 }}>
                Trader B
              </h1>
              <span style={{
                fontSize: "11px", fontWeight: 600, padding: "3px 10px",
                borderRadius: "20px", background: "#E1F5EE", color: "#0F6E56",
                border: "1px solid #5DCAA5"
              }}>지인 트레이더</span>
            </div>
            <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", lineHeight: 1.7 }}>
              ONE-HUB AI 엔진을 동일하게 사용하는 지인 트레이더입니다.
              매일 AI 판단 근거와 거래 결과가 자동으로 업데이트됩니다.
            </p>
          </div>

          {/* A vs B 현황 카드 */}
          <section style={{ marginBottom: "2rem" }}>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
              Trader A vs Trader B 실시간 현황
            </h2>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>

              <div style={{ background: "#E6F1FB", border: "1px solid #85B7EB", borderRadius: "12px", padding: "1.25rem" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#185FA5", marginBottom: "8px", fontFamily: "Space Mono, monospace" }}>
                  TRADER A — 운영자
                </div>
                {traderA ? (
                  <>
                    <div style={{ fontSize: "0.875rem", color: "#0C447C", marginBottom: "4px" }}>
                      엔진: {traderA.engine?.status === "running" ? "🟢 실행 중" : "⚪ 중지"}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#0C447C", marginBottom: "4px" }}>버전: {traderA.version || "v8.0"}</div>
                    <div style={{ fontSize: "0.875rem", color: "#0C447C" }}>보유 종목: {traderA.holdings?.length || 0}개</div>
                  </>
                ) : <div style={{ fontSize: "0.875rem", color: "#185FA5" }}>로딩 중...</div>}
              </div>

              <div style={{ background: "#E1F5EE", border: "1px solid #5DCAA5", borderRadius: "12px", padding: "1.25rem" }}>
                <div style={{ fontSize: "11px", fontWeight: 600, color: "#0F6E56", marginBottom: "8px", fontFamily: "Space Mono, monospace" }}>
                  TRADER B — 지인 트레이더
                </div>
                {loading ? (
                  <div style={{ fontSize: "0.875rem", color: "#0F6E56" }}>로딩 중...</div>
                ) : traderData ? (
                  <>
                    <div style={{ fontSize: "0.875rem", color: "#085041", marginBottom: "4px" }}>
                      엔진: {traderData.engine?.status === "running" ? "🟢 실행 중" : "⚪ 대기 중"}
                    </div>
                    <div style={{ fontSize: "0.875rem", color: "#085041", marginBottom: "4px" }}>버전: {traderData.version || "v8.0"}</div>
                    <div style={{ fontSize: "0.875rem", color: "#085041" }}>보유 종목: {traderData.holdings?.length || 0}개</div>
                  </>
                ) : (
                  <div style={{ fontSize: "0.875rem", color: "#0F6E56" }}>API 키 등록 후 활성화됩니다.</div>
                )}
              </div>
            </div>
          </section>

          {/* 오늘의 AI 판단 */}
          <section style={{
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "12px", padding: "1.5rem", marginBottom: "2rem"
          }}>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
              📊 오늘의 AI 판단 근거
            </h2>

            {reportLoading ? (
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>AI 분석 로딩 중...</div>
            ) : report?.ok ? (
              <>
                {/* 인사이트 */}
                <div style={{
                  background: "#F0FAF5", border: "1px solid #5DCAA5",
                  borderRadius: "8px", padding: "1rem", marginBottom: "1.25rem"
                }}>
                  <div style={{ fontSize: "11px", fontWeight: 600, color: "#0F6E56", marginBottom: "6px", fontFamily: "Space Mono, monospace" }}>
                    AI INSIGHT
                  </div>
                  <p style={{ fontSize: "0.9rem", lineHeight: 1.7, margin: 0 }}>{report.insight}</p>
                </div>

                {/* 지표 요약 */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
                  {[
                    { label: "Regime", value: `${regimeEmoji(report.regime)} ${report.regime}`, color: regimeColor(report.regime) },
                    { label: "Heat Score", value: `${report.heat_score}/100 (${report.heat_grade})`, color: "#1A1A1A" },
                    { label: "체결 / 차단", value: `${report.trade_count}건 / ${report.block_count}건`, color: "#1A1A1A" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "#F8F7F2", border: "1px solid var(--color-border)",
                      borderRadius: "8px", padding: "0.875rem", textAlign: "center"
                    }}>
                      <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>{item.label}</div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* 판단 근거 */}
                {report.judgment && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "6px", fontFamily: "Space Mono, monospace" }}>
                      왜 매수하지 않았는가
                    </div>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.7, margin: 0, color: "var(--color-text)" }}>{report.judgment}</p>
                  </div>
                )}

                {/* 내일 전략 */}
                {report.tomorrow && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "6px", fontFamily: "Space Mono, monospace" }}>
                      내일 전략
                    </div>
                    <p style={{ fontSize: "0.875rem", lineHeight: 1.7, margin: 0, color: "var(--color-text)" }}>{report.tomorrow}</p>
                  </div>
                )}

                {/* 거래 내역 */}
                {report.trades?.length > 0 && (
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: "var(--color-muted)", marginBottom: "8px", fontFamily: "Space Mono, monospace" }}>
                      오늘 거래 내역
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                            {["시간", "종목", "구분", "수량", "가격", "손익"].map(h => (
                              <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--color-muted)", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {report.trades.map(t => (
                            <tr key={t.id} style={{ borderBottom: "1px solid var(--color-border)" }}>
                              <td style={{ padding: "6px 8px", fontFamily: "Space Mono, monospace" }}>{t.time}</td>
                              <td style={{ padding: "6px 8px", fontWeight: 600 }}>{t.stock}</td>
                              <td style={{ padding: "6px 8px" }}>{t.action}</td>
                              <td style={{ padding: "6px 8px" }}>{t.qty}주</td>
                              <td style={{ padding: "6px 8px" }}>{t.price?.toLocaleString()}원</td>
                              <td style={{ padding: "6px 8px", fontWeight: 600, color: pnlColor(t.pnl) }}>{t.pnl >= 0 ? "+" : ""}{t.pnl?.toLocaleString()}원</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div style={{ marginTop: "1rem", fontSize: "0.75rem", color: "var(--color-muted)" }}>
                  기준일: {report.date} | 매일 15:30 자동 업데이트
                </div>
              </>
            ) : (
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
                onehub-b.service 시작 후 데이터가 표시됩니다.
              </div>
            )}
          </section>

          {/* 누적 성과 */}
          <section style={{
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "12px", padding: "1.5rem", marginBottom: "2rem"
          }}>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
              📈 누적 성과 (최근 30일)
            </h2>

            {history?.ok && history.history?.length > 0 ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.75rem", marginBottom: "1.25rem" }}>
                  {[
                    { label: "누적 손익", value: `${history.total_pnl >= 0 ? "+" : ""}${history.total_pnl?.toLocaleString()}원`, color: pnlColor(history.total_pnl) },
                    { label: "운영 일수", value: `${history.history.length}일`, color: "#1A1A1A" },
                    { label: "총 거래", value: `${history.history.reduce((s, d) => s + d.trade_count, 0)}건`, color: "#1A1A1A" },
                  ].map(item => (
                    <div key={item.label} style={{
                      background: "#F8F7F2", border: "1px solid var(--color-border)",
                      borderRadius: "8px", padding: "0.875rem", textAlign: "center"
                    }}>
                      <div style={{ fontSize: "11px", color: "var(--color-muted)", marginBottom: "4px", fontFamily: "Space Mono, monospace" }}>{item.label}</div>
                      <div style={{ fontSize: "0.875rem", fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--color-border)" }}>
                        {["날짜", "Regime", "거래", "일손익", "누적"].map(h => (
                          <th key={h} style={{ padding: "6px 8px", textAlign: "left", color: "var(--color-muted)", fontWeight: 600 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {history.history.map(d => (
                        <tr key={d.date} style={{ borderBottom: "1px solid var(--color-border)" }}>
                          <td style={{ padding: "6px 8px", fontFamily: "Space Mono, monospace" }}>{d.date}</td>
                          <td style={{ padding: "6px 8px", color: regimeColor(d.regime) }}>{regimeEmoji(d.regime)} {d.regime}</td>
                          <td style={{ padding: "6px 8px" }}>{d.trade_count}건</td>
                          <td style={{ padding: "6px 8px", color: pnlColor(d.pnl), fontWeight: 600 }}>{d.pnl >= 0 ? "+" : ""}{d.pnl?.toLocaleString()}원</td>
                          <td style={{ padding: "6px 8px", color: pnlColor(d.cumulative), fontWeight: 600 }}>{d.cumulative >= 0 ? "+" : ""}{d.cumulative?.toLocaleString()}원</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <div style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
                거래 시작 후 성과 데이터가 누적됩니다.
              </div>
            )}
          </section>

          {/* API 키 등록 안내 */}
          <section style={{
            background: "var(--color-surface)", border: "1px solid var(--color-border)",
            borderRadius: "12px", padding: "1.5rem", marginBottom: "2rem"
          }}>
            <h2 style={{ fontFamily: "Syne, sans-serif", fontSize: "1rem", fontWeight: 600, marginBottom: "1rem" }}>
              참여 방법
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {[
                { step: "01", title: "지인 초대 필요", desc: "현재 운영자의 초대를 받은 분만 참여할 수 있습니다." },
                { step: "02", title: "KIS API 발급", desc: "KIS 홈트레이딩 사이트 → KIS Developers에서 API 발급. App Key + App Secret 필요." },
                { step: "03", title: "API 키 등록", desc: "아래 버튼을 눌러 API 키를 입력하세요. AES-256으로 암호화되어 안전하게 보관됩니다." },
                { step: "04", title: "자동매매 시작", desc: "AI가 매일 9시 5분부터 자동으로 매매를 실행합니다. 텔레그램으로 실시간 알림을 받습니다." },
              ].map(item => (
                <div key={item.step} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                  <span style={{ fontFamily: "Space Mono, monospace", fontSize: "11px", fontWeight: 700, color: "#9A9690", minWidth: "24px", marginTop: "2px" }}>
                    {item.step}
                  </span>
                  <div>
                    <div style={{ fontSize: "0.875rem", fontWeight: 600, marginBottom: "2px" }}>{item.title}</div>
                    <div style={{ fontSize: "0.8rem", color: "var(--color-muted)", lineHeight: 1.6 }}>{item.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div style={{ textAlign: "center" }}>
            <Link href="/settings/api-key">
              <button style={{
                padding: "14px 32px", borderRadius: "8px",
                background: "#1A1A1A", color: "#F8F7F2",
                border: "none", fontSize: "1rem", fontWeight: 600,
                cursor: "pointer", fontFamily: "Syne, sans-serif"
              }}>
                API 키 등록하기
              </button>
            </Link>
            <p style={{ marginTop: "0.75rem", fontSize: "0.75rem", color: "var(--color-muted)" }}>
              등록 후 다음 영업일부터 자동매매가 시작됩니다.
            </p>
          </div>

        </main>
      </div>
    </>
  );
}