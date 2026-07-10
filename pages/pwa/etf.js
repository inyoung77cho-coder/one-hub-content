// ONE-HUB v10 — ETF / Asset Intelligence 대시보드 (P7, 작업지시서 §11.2)
// 독립 라우트. 확정값(수익3단분해·세금·중복도)은 진한색/실선. 예측(Forecast)은 시나리오 투영(참고용·확정 아님).
// ★ 단일 점수 블랙박스 금지 — Portfolio Score는 구성요소를 펼쳐 보여준다(§11.2).
import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import { getTrader } from "../../lib/trader";

const won = (n) => {
  if (n == null) return "-";
  const a = Math.abs(n);
  if (a >= 1e8) return `${(n / 1e8).toFixed(2)}억`;
  if (a >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만`;
  return Math.round(n).toLocaleString();
};
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`);
const sign = (n) => (n > 0 ? "pos" : n < 0 ? "neg" : "");

export default function EtfDashboard() {
  const [report, setReport] = useState(null);
  const [tax, setTax] = useState(null);
  const [overlap, setOverlap] = useState(null);
  const [rebal, setRebal] = useState(null);
  const [err, setErr] = useState(null);
  const [liveFx, setLiveFx] = useState(null); // 당일 USD/KRW 실시간 환율(매일 자동 갱신)

  useEffect(() => {
    const load = () => {
      const tr = getTrader(); // [§3-8] 선택된 계좌(A/B) 반영
      const g = (fn) => fetch(`/api/pwa/etf/${fn}?trader=${tr}`).then((r) => r.json());
      Promise.all([g("report"), g("tax"), g("overlap"), g("rebalance")])
        .then(([r, t, o, rb]) => {
          if (r.error || t.error) setErr(r.error || t.error);
          setReport(r); setTax(t); setOverlap(o); setRebal(rb);
        })
        .catch((e) => setErr(e.message));
    };
    load();
    // 오늘 환율 — 일일 캐시 소스에서 조회(실패 시 백엔드 종가로 폴백)
    fetch("/api/fx/usdkrw").then((r) => r.json()).then((d) => { if (d?.ok) setLiveFx(d); }).catch(() => {});
    // [§3-8] 다른 페이지에서 계좌 전환 시 즉시 재조회
    const onTrader = () => load();
    window.addEventListener("onehub-trader-change", onTrader);
    return () => window.removeEventListener("onehub-trader-change", onTrader);
  }, []);

  const s = report?.summary;
  const positions = (report?.positions || []).filter((p) => !p.error);

  // [환율 신선도] 기준일이 오늘(KST)인지 표시 — 오래된 종가 환율이면 사용자에게 명확히 알림
  const asof = report?.as_of;
  const todayKST = (() => { try { return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" }); } catch (e) { return null; } })();
  const fxDate = asof?.fx_date || asof?.price_date || null;
  const fxFresh = fxDate && todayKST ? fxDate === todayKST : null;
  // [종가 신선도] ETF 평가 기준일(백엔드 종가)이 최근 거래일인지 표기 — 백엔드가 갱신되면 자동으로 '최신'.
  const priceDate = asof?.price_date || null;
  const priceDaysAgo = (() => {
    if (!priceDate || !todayKST) return null;
    const diff = Math.round((new Date(todayKST).getTime() - new Date(priceDate).getTime()) / 86400000);
    return Number.isFinite(diff) ? Math.max(0, diff) : null;
  })();
  const priceStale = priceDaysAgo != null && priceDaysAgo > 2; // 주말 감안 2일 초과면 지연 표기
  const fxDaysAgo = (() => {
    if (!fxDate || !todayKST) return null;
    const diff = Math.round((new Date(todayKST).getTime() - new Date(fxDate).getTime()) / 86400000);
    return Number.isFinite(diff) ? Math.max(0, diff) : null;
  })();

  // [§3-6 피드백11·12] 핵심 리스크 한 줄 + 리밸런싱 이유(왜) — overlap/tax 데이터에서 산출
  const maxSector = overlap?.sectors?.[0];
  const overlapWarn = overlap?.warnings?.length ? overlap.warnings[0] : null;
  const riskParts = [];
  if (maxSector) riskParts.push(`${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중`);
  if (overlapWarn) riskParts.push(overlapWarn);
  const topRisk = riskParts.length ? riskParts.join(" · ") : null;
  const rebalReasons = [];
  if (maxSector && maxSector.weight * 100 >= 25) rebalReasons.push(`${maxSector.sector} ${(maxSector.weight * 100).toFixed(0)}% 집중 — 상한 초과분 축소`);
  if (overlapWarn) rebalReasons.push(`${overlapWarn} — 중복 종목 통합으로 실질 분산 확보`);
  if (tax?.losses?.length) rebalReasons.push(`손실 종목(${tax.losses.map((l) => l.ticker).join("·")}) 손익통산 — 절세 매도 후 재매수 검토`);

  return (
    <div className="etf pwa-shell">
      <TopNav active="etf" />

      {/* 1) HERO — ETF 총평가액 + 원화 실질수익 3분해 (시안: 다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">📊 ETF 자산{priceDate ? ` · ${priceDate} 종가 기준` : ""}{priceDate ? <span className={`date-flag ${priceStale ? "stale" : "fresh"}`}>{priceStale ? `지연 ${priceDaysAgo}일` : "최신"}</span> : null}</span>
          <span className="live">LIVE</span>
        </div>
        {liveFx?.ok ? (
          <div className="fx-note">
            <span className="fx-dot" />
            환율 <b>{liveFx.rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}원</b>
            {liveFx.date === todayKST ? " · 오늘 기준 · 자동 갱신"
              : liveFx.date ? ` · ${liveFx.date} 기준(최신) · 자동 갱신` : " · 최신 · 자동 갱신"}
          </div>
        ) : asof?.fx != null ? (
          <div className={`fx-note ${fxFresh === false ? "stale" : ""}`}>
            <span className="fx-dot" />
            환율 <b>{asof.fx.toLocaleString()}원</b>
            {fxFresh === true ? " · 오늘 기준"
              : fxDaysAgo != null && fxDaysAgo > 0 ? ` · ${fxDaysAgo}일 전 종가 환율`
              : fxDate ? ` · ${fxDate} 종가 환율` : ""}
          </div>
        ) : null}
        {s ? (
          <>
            <div className="big">{won(s.value_krw)}<span>원</span></div>
            <div className="hsub">취득 {won(s.krw_cost)} → 평가손익 <b>{won(s.value_krw - s.krw_cost)}원</b> · <b>{pct(s.total_pnl_pct)}</b></div>
            <div className="decomp">
              <div className="drow"><span className="dk">ETF 자체수익 ($)</span><span className={`dv ${sign(s.etf_self_pct)}`}>{pct(s.etf_self_pct)}</span></div>
              <div className="drow"><span className="dk">환차손익</span><span className={`dv ${sign(s.fx_pure_pct)}`}>{pct(s.fx_pure_pct)}</span></div>
              <div className="drow"><span className="dk">교차항</span><span className={`dv ${sign(s.cross_pct)}`}>{pct(s.cross_pct)}</span></div>
              <div className="drow total"><span className="dk">실질 원화수익</span><span className={`dv ${sign(s.total_pnl_pct)}`}>{pct(s.total_pnl_pct)}</span></div>
            </div>
            <div className="foot-note">달러 수익 {pct(s.etf_self_pct)} 위에 환율효과 {pct((s.fx_pure_pct||0) + (s.cross_pct||0))}가 더해진 원화 실질 수익입니다.</div>
          </>
        ) : (
          <div className="hsub">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* [§3-6 피드백11] #1 결론 VerdictCard — 대표지표(실질 원화수익)를 못박고 핵심 리스크 노출 */}
      {s && (
        <div className="etf-verdict">
          <div className="ev-lead">
            <span className="ev-lbl">📌 이 포트폴리오의 결론</span>
            <span className={`ev-metric ${sign(s.total_pnl_pct)}`}>실질 원화수익 {pct(s.total_pnl_pct)}</span>
          </div>
          <div className="ev-decomp">ETF <b>{pct(s.etf_self_pct)}</b> + 환 <b>{pct(s.fx_pure_pct)}</b> + 교차 <b>{pct(s.cross_pct)}</b></div>
          {topRisk && <div className="ev-risk">⚠️ 핵심 리스크 · {topRisk}</div>}
        </div>
      )}

      {/* [§3-2 원칙1] 총자산 바 제거 — 총자산은 홈·AI자산 2곳에만. ETF 페이지는 ETF 슬라이스만 표시 */}
      {err && <div className="err">데이터 로드 오류: {err}</div>}

      {/* 2) Portfolio Score — 블랙박스 금지, 구성요소 공개 */}
      {s && tax && overlap && (
        <section className="card">
          <div className="label">Portfolio Score <span className="sub">구성요소</span></div>
          <div className="score-grid">
            <div className="sc"><span>실질 수익률</span><b className={sign(s.total_pnl_pct)}>{pct(s.total_pnl_pct)}</b></div>
            <div className="sc"><span>종목 수</span><b>{positions.length}</b></div>
            <div className="sc"><span>최대 섹터집중</span><b>{overlap.sectors?.[0] ? `${overlap.sectors[0].sector} ${(overlap.sectors[0].weight * 100).toFixed(0)}%` : "-"}</b></div>
            <div className="sc"><span>예상 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
            <div className="sc"><span>손익통산 손실</span><b>{tax.losses?.map((l) => l.ticker).join(", ") || "없음"}</b></div>
            <div className="sc"><span>배당(연)</span><b className="pos">${tax.dividend_usd}</b></div>
          </div>
        </section>
      )}

      {/* 3) Overlap Heat Map (확정, SAMPLE holdings) */}
      {overlap && !overlap.error && (
        <section className="card">
          <div className="label">종목 중복 노출 (Heat Map)
            <span className="sub">{overlap.note?.includes("SAMPLE") ? "SAMPLE·주간수집 축적중" : ""}</span>
          </div>
          <div className="heat">
            {overlap.stocks?.slice(0, 8).map((st) => (
              <div className="hrow" key={st.ticker}>
                <span className="ht">{st.ticker}</span>
                <div className="hbar"><div style={{ width: `${Math.min(100, st.weight * 100 * 6)}%` }} /></div>
                <span className="hw">{(st.weight * 100).toFixed(1)}%</span>
              </div>
            ))}
          </div>
          <div className="sectors">
            {overlap.sectors?.slice(0, 5).map((sc) => (
              <span className="chip" key={sc.sector}>{sc.sector} {(sc.weight * 100).toFixed(0)}%</span>
            ))}
          </div>
          {overlap.warnings?.length > 0 && (
            <div className="warn">⚠ {overlap.warnings.join(" · ")}</div>
          )}
        </section>
      )}

      {/* 3.5) 자산 배분 / 리밸런싱 (P4) — [§3-6 피드백12] 왜(조정 이유) 명시 */}
      {rebal && (
        <section className="card">
          <div className="label">자산 배분 · 리밸런싱
            <span className="sub">{rebal.actions ? "현재 → 목표" : "현재 비중"}</span>
          </div>
          {rebalReasons.length > 0 && (
            <div className="rb-why">
              <div className="rb-why-h">🎯 왜 조정하나</div>
              {rebalReasons.map((r, i) => (
                <div className="rb-why-row" key={i}><span className="rb-why-n">{i + 1}</span><span className="rb-why-t">{r}</span></div>
              ))}
            </div>
          )}
          {rebal.actions ? (
            <>
              {rebal.actions.filter((a) => a.action !== "HOLD").map((a) => (
                <div className="rb" key={a.ticker}>
                  <span className="rt">{a.ticker}</span>
                  <span className="rw">{(a.current_weight * 100).toFixed(1)}% → {(a.target_weight * 100).toFixed(0)}%</span>
                  <b className={a.action === "SELL" ? "neg" : "pos"}>{a.action} {a.qty}주</b>
                </div>
              ))}
              <div className="rb-tax">리밸런싱 매도 예상 양도세 <b className="neg">{won(rebal.est_tax_krw)}원</b> · 밴드 내는 보유 권장</div>
            </>
          ) : (
            <>
              {Object.entries(rebal.current || {}).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t, w]) => (
                <div className="hrow" key={t}>
                  <span className="ht">{t}</span>
                  <div className="hbar"><div style={{ width: `${Math.min(100, w * 100 * 3)}%` }} /></div>
                  <span className="hw">{(w * 100).toFixed(1)}%</span>
                </div>
              ))}
              <div className="rb-tax sub">상위 종목 집중도 확인용. 목표비중 설정 시 실행 가능한 리밸런싱(세금 포함) 제안이 표시됩니다.</div>
            </>
          )}
        </section>
      )}

      {/* [§3-6 피드백13] 시계열·예측(ForecastChart) — 실제 평가액을 기점으로 시나리오 투영. 항상 '참고용·확정 아님' */}
      {s && s.value_krw > 0 && (() => {
        // 가정(투명 공개): 연 기대수익 μ · 변동성 σ. 확정 예측이 아닌 통계적 시나리오.
        const MU = 0.07, SIG = 0.16, MONTHS = 12;
        const V0 = s.value_krw;
        const hist = Array.isArray(report?.timeseries)
          ? report.timeseries.filter((p) => p && p.value > 0).slice(-12) : [];
        const hasHist = hist.length >= 2;
        // 투영: t개월 후 중립/낙관/비관 (선형 확산 콘)
        const proj = [];
        for (let t = 0; t <= MONTHS; t++) {
          const f = t / 12;
          proj.push({
            t,
            med: V0 * (1 + MU * f),
            up: V0 * (1 + (MU + SIG) * f),
            lo: V0 * (1 + (MU - SIG) * f),
          });
        }
        const W = 300, H = 132, PADL = 6, PADR = 6, PADT = 10, PADB = 18;
        const nHist = hasHist ? hist.length : 0;
        const totalPts = nHist + MONTHS; // 과거 점 + 미래 12
        const xAt = (i) => PADL + (i / totalPts) * (W - PADL - PADR);
        const allVals = [
          ...proj.map((p) => p.up), ...proj.map((p) => p.lo),
          ...(hasHist ? hist.map((h) => h.value) : [V0]),
        ];
        const vMin = Math.min(...allVals), vMax = Math.max(...allVals);
        const span = vMax - vMin || 1;
        const yAt = (v) => PADT + (1 - (v - vMin) / span) * (H - PADT - PADB);
        // 미래 x는 과거 마지막 점(=현재, index nHist) 이후로 이어짐
        const fx = (t) => xAt(nHist + t);
        const upPath = proj.map((p, i) => `${i ? "L" : "M"}${fx(p.t).toFixed(1)},${yAt(p.up).toFixed(1)}`).join("");
        const loPathRev = [...proj].reverse().map((p) => `L${fx(p.t).toFixed(1)},${yAt(p.lo).toFixed(1)}`).join("");
        const areaPath = `${upPath}${loPathRev}Z`;
        const medPath = proj.map((p, i) => `${i ? "L" : "M"}${fx(p.t).toFixed(1)},${yAt(p.med).toFixed(1)}`).join("");
        const histPath = hasHist
          ? hist.map((h, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(h.value).toFixed(1)}`).join("")
          : "";
        const nowX = xAt(nHist), nowY = yAt(V0);
        const end = proj[proj.length - 1];
        return (
          <section className="card">
            <div className="label">시계열 · 예측 <span className="sub forecast-tag">참고용 · 확정 아님</span></div>
            <svg className="fc-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="ETF 평가액 시나리오 투영">
              <path d={areaPath} className="fc-area" />
              {hasHist && <path d={histPath} className="fc-hist" />}
              <path d={medPath} className="fc-med" />
              <line x1={nowX} y1={PADT} x2={nowX} y2={H - PADB} className="fc-now" />
              <circle cx={nowX} cy={nowY} r="3.2" className="fc-dot" />
              <text x={nowX} y={H - 5} className="fc-xlbl" textAnchor={hasHist ? "middle" : "start"}>오늘</text>
              <text x={fx(MONTHS)} y={H - 5} className="fc-xlbl" textAnchor="end">+12개월</text>
            </svg>
            <div className="fc-legend">
              <span><i className="fc-lg med" /> 중립</span>
              <span><i className="fc-lg band" /> 낙관~비관 범위</span>
              {hasHist && <span><i className="fc-lg hist" /> 실제 평가액</span>}
            </div>
            <div className="fc-range">
              12개월 후 참고 범위 <b className="pos">{won(end.up)}</b> ~ <b className="neg">{won(end.lo)}</b>
              <span className="fc-mid"> · 중립 {won(end.med)}</span>
            </div>
            <div className="fc-assume">가정: 연 기대수익 <b>+{(MU * 100).toFixed(0)}%</b> · 변동성 <b>{(SIG * 100).toFixed(0)}%</b> (주식형 ETF 통상치). <b>확정 예측이 아닌 통계적 시나리오</b>이며 실제 수익은 시장 상황에 따라 달라집니다.{!hasHist && " 일별 평가액이 쌓이면 실제 추이선이 함께 표시됩니다."}</div>
          </section>
        );
      })()}

      {/* 4) 절세 (확정 계산) */}
      {tax && (
        <section className="card">
          <div className="label">세금 · 절세 <span className="sub">확정 계산</span></div>
          <div className="tax-line"><span>전량 매도 시 양도세</span><b className="neg">{won(tax.tax_all)}원</b></div>
          <div className="tax-hint">
            순이익 {won(tax.net)}원 − 기본공제 250만 = 과세표준 {won(tax.base_all)}원 × 22%
          </div>
          <div className="tax-hint sub">
            손실종목({tax.losses?.map((l) => l.ticker).join("·") || "-"}) 손익통산 후. 손실수확+이익이연 시 올해 0원 가능.
          </div>
        </section>
      )}

      {/* 5) 종목별 수익 분해 — 총투자액/총이익금 SummaryBar + 3열 정렬(시안) */}
      {positions.length > 0 && (
        <section className="card">
          <div className="label">종목별 수익 분해</div>
          {s && (
            <div className="ebd-sum">
              <div className="es-item"><span className="es-k">총 투자액</span><span className="es-v">{won(s.krw_cost)}</span></div>
              <div className="es-item"><span className="es-k">총 이익금</span><span className={`es-v ${sign(s.value_krw - s.krw_cost)}`}>{won(s.value_krw - s.krw_cost)}</span></div>
            </div>
          )}
          {[...positions].sort((a, b) => (b.total_pnl_pct ?? b.usd_pnl_pct ?? 0) - (a.total_pnl_pct ?? a.usd_pnl_pct ?? 0)).map((p) => {
            const invest = p.krw_cost ?? p.invested_krw ?? p.cost_krw ?? null;
            const profit = p.pnl_krw ?? p.profit_krw ?? (p.value_krw != null && invest != null ? p.value_krw - invest : null);
            const tot = p.total_pnl_pct ?? p.usd_pnl_pct;
            return (
              <div className="erow" key={p.ticker}>
                <span className="eleft">
                  <span className="etk">{p.ticker}</span>
                  {invest != null && <span className="einv">{won(invest)}</span>}
                </span>
                <span className="emid">
                  {p.mode === "full" ? (
                    <><span className="eself">{pct(p.etf_self_pct)}</span><span className="echa">환차 {pct(p.fx_pure_pct)}</span></>
                  ) : (
                    <span className="eself sub">USD only</span>
                  )}
                </span>
                <span className="eright">
                  <span className={`ett ${sign(tot)}`}>{pct(tot)}</span>
                  {profit != null && <span className={`eprofit ${sign(profit)}`}>{profit >= 0 ? "+" : ""}{won(profit)}</span>}
                </span>
              </div>
            );
          })}
          <div className="ebd-note">왼쪽은 투자액, 가운데는 자체수익(달러)·환차손익, 오른쪽은 원화 실질수익률과 이익금입니다.</div>
        </section>
      )}

      <div className="foot">확정 계산(수익·세금·중복도)은 입력값 기반. 예측(Forecast)은 통계적 시나리오(참고용·확정 아님). · 세무자문 아님</div>

      <style jsx>{`
        .etf { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .loading { color: var(--color-ink-2); padding: 24px; text-align: center; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .hero .big { font-size: 32px; font-weight: 800; letter-spacing: -.8px; line-height: 1; }
        .hero .big span { font-size: 19px; font-weight: 700; }
        .date-flag { display: inline-block; margin-left: 7px; font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; letter-spacing: .2px; vertical-align: middle; }
        .date-flag.fresh { background: color-mix(in srgb, var(--color-success) 22%, transparent); color: var(--color-success); }
        .date-flag.stale { background: color-mix(in srgb, var(--color-warning) 22%, transparent); color: var(--color-warning); }
        .fx-note { display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; color: var(--hero-ink-soft); margin: -6px 0 4px; }
        .fx-note b { color: var(--hero-ink); font-weight: 700; }
        .fx-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-success); flex-shrink: 0; }
        .fx-note.stale { color: var(--color-warning); }
        .fx-note.stale .fx-dot { background: var(--color-warning); }
        .fx-note.stale b { color: var(--color-warning); }
        .hero .hsub { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 9px; }
        .hero .hsub b { color: var(--hero-accent); font-weight: 700; }
        .decomp { background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 14px; padding: 14px; margin-top: 16px; }
        .drow { display: flex; align-items: center; justify-content: space-between; padding: 6px 0; }
        .drow .dk { font-size: 12.5px; color: var(--hero-ink-soft); font-weight: 500; }
        .drow .dv { font-size: 13px; font-weight: 700; color: var(--hero-accent); }
        .drow .dv.neg { color: var(--hero-danger); }
        .drow.total { border-top: 1px solid var(--hero-fill-line); margin-top: 6px; padding-top: 11px; }
        .drow.total .dk { color: var(--hero-ink); font-weight: 700; font-size: 13px; }
        .drow.total .dv { font-size: 16px; font-weight: 800; }
        .hero .foot-note { font-size: 11px; color: var(--hero-ink-faint); margin-top: 12px; line-height: 1.5; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: center; }
        .label .sub, .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* [v10 UI §1] 초록=수익, 빨강=손실/비용 */
        .pos { color: var(--color-success); } .neg { color: var(--color-danger); }
        .score-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px 12px; }
        .sc { display: flex; flex-direction: column; gap: 3px; }
        .sc span { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; } .sc b { font-size: 1rem; font-weight: 800; }
        .heat { display: flex; flex-direction: column; gap: 6px; }
        .hrow { display: flex; align-items: center; gap: 10px; margin-bottom: 5px; }
        .ht { width: 52px; font-size: 0.78rem; font-weight: 700; }
        .hbar { flex: 1; background: var(--color-line); border-radius: 6px; height: 9px; overflow: hidden; }
        .hbar div { height: 100%; background: var(--color-primary); border-radius: 6px; }
        .hw { width: 44px; text-align: right; font-size: 0.78rem; font-weight: 700; color: var(--color-ink-2); }
        .sectors { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
        .chip { font-size: 0.72rem; font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); padding: 6px 10px; border-radius: 9px; }
        .warn { margin-top: 10px; font-size: 0.74rem; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 7px 9px; border-radius: 8px; }
        .tax-line { display: flex; justify-content: space-between; align-items: baseline; font-size: 1.05rem; font-weight: 800; }
        .tax-line b { font-size: 1.3rem; }
        .tax-hint { font-size: 0.78rem; color: var(--color-ink-2); margin-top: 8px; line-height: 1.6; background: var(--color-card-soft); border-radius: 12px; padding: 12px 14px; }
        .tax-hint.sub { background: var(--color-success-soft); color: var(--color-success-ink); font-weight: 600; }
        /* per-ETF SummaryBar + aligned rows */
        .ebd-sum { display: flex; background: var(--color-card-soft); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; }
        .es-item { flex: 1; display: flex; flex-direction: column; gap: 5px; }
        .es-item + .es-item { border-left: 1px solid var(--color-line); padding-left: 16px; }
        .es-k { font-size: 0.72rem; color: var(--color-ink-3); font-weight: 600; }
        .es-v { font-size: 1.05rem; font-weight: 800; color: var(--color-ink); }
        .es-v.pos { color: var(--color-success); } .es-v.neg { color: var(--color-danger); }
        .erow { display: grid; grid-template-columns: 1fr 84px 92px; align-items: center; gap: 6px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .erow:first-of-type { border-top: none; }
        .eleft { display: flex; flex-direction: column; gap: 3px; }
        .eleft .etk { font-size: 0.9rem; font-weight: 800; }
        .eleft .einv { font-size: 0.68rem; color: var(--color-ink-3); font-weight: 500; }
        .emid { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .emid .eself { font-size: 0.74rem; color: var(--color-ink-2); font-weight: 600; }
        .emid .eself.sub { color: var(--color-ink-3); }
        .emid .echa { font-size: 0.66rem; color: var(--color-ink-3); font-weight: 500; }
        .eright { display: flex; flex-direction: column; gap: 3px; text-align: right; }
        .eright .ett { font-size: 0.9rem; font-weight: 800; }
        .eright .ett.pos { color: var(--color-success); } .eright .ett.neg { color: var(--color-danger); }
        .eright .eprofit { font-size: 0.72rem; font-weight: 700; }
        .eright .eprofit.pos { color: var(--color-success); } .eright .eprofit.neg { color: var(--color-danger); }
        .ebd-note { font-size: 0.66rem; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .rb { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--color-line); font-size: 0.84rem; }
        .rb .rt { width: 56px; font-weight: 700; font-family: ui-monospace, monospace; }
        .rb .rw { flex: 1; color: var(--color-ink-2); font-size: 0.74rem; }
        .rb-tax { font-size: 0.72rem; color: var(--color-ink-2); margin-top: 10px; background: var(--color-card-soft); padding: 7px 9px; border-radius: 8px; }
        /* [§3-6] #1 결론 VerdictCard */
        .etf-verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 15px 17px; margin-bottom: 14px; }
        .ev-lead { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
        .ev-lbl { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); }
        .ev-metric { font-size: 1.05rem; font-weight: 800; }
        .ev-metric.pos { color: var(--color-success); } .ev-metric.neg { color: var(--color-danger); }
        .ev-decomp { font-size: 0.8rem; color: var(--color-ink-2); margin-top: 6px; }
        .ev-decomp b { color: var(--color-ink); font-weight: 700; }
        .ev-risk { font-size: 0.8rem; color: var(--color-warning-ink); background: var(--color-warning-soft); border-radius: 10px; padding: 9px 12px; margin-top: 11px; line-height: 1.45; word-break: keep-all; }
        /* [§3-6] 리밸런싱 왜(조정 이유) */
        .rb-why { background: var(--color-card-soft); border-radius: 12px; padding: 12px 13px; margin-bottom: 12px; }
        .rb-why-h { font-size: 0.74rem; font-weight: 800; color: var(--color-ink-2); margin-bottom: 8px; }
        .rb-why-row { display: flex; gap: 9px; align-items: flex-start; padding: 4px 0; }
        .rb-why-n { flex-shrink: 0; width: 18px; height: 18px; border-radius: 6px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; margin-top: 1px; }
        .rb-why-t { font-size: 0.78rem; color: var(--color-ink); line-height: 1.5; word-break: keep-all; }
        /* [§3-6] ForecastChart 참고용 */
        .forecast-tag { color: var(--color-warning-ink) !important; background: var(--color-warning-soft); padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 800; }
        .forecast-empty { text-align: center; padding: 18px 10px; }
        .fe-ic { font-size: 1.5rem; margin-bottom: 6px; }
        .fe-t { font-size: 0.86rem; font-weight: 700; color: var(--color-ink); }
        .fe-s { font-size: 0.74rem; color: var(--color-ink-2); margin-top: 6px; line-height: 1.55; word-break: keep-all; }
        .fe-s b { color: var(--color-ink); font-weight: 700; }
        /* [#13] 시나리오 투영 차트 */
        .fc-svg { width: 100%; height: 132px; display: block; margin: 4px 0 2px; overflow: visible; }
        .fc-area { fill: var(--color-primary-soft); opacity: 0.55; stroke: none; }
        .fc-med { fill: none; stroke: var(--color-primary); stroke-width: 2; stroke-dasharray: 5 3; }
        .fc-hist { fill: none; stroke: var(--color-ink); stroke-width: 2; }
        .fc-now { stroke: var(--color-ink-3); stroke-width: 1; stroke-dasharray: 2 2; }
        .fc-dot { fill: var(--color-primary); stroke: var(--color-card); stroke-width: 1.5; }
        .fc-xlbl { fill: var(--color-ink-3); font-size: 9px; font-weight: 700; }
        .fc-legend { display: flex; gap: 14px; flex-wrap: wrap; font-size: 0.7rem; color: var(--color-ink-2); margin-top: 4px; }
        .fc-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .fc-lg { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
        .fc-lg.med { background: var(--color-primary); } .fc-lg.hist { background: var(--color-ink); }
        .fc-lg.band { background: var(--color-primary-soft); height: 9px; border-radius: 2px; }
        .fc-range { font-size: 0.82rem; color: var(--color-ink-2); margin-top: 11px; padding-top: 10px; border-top: 1px solid var(--color-line); word-break: keep-all; }
        .fc-range b.pos { color: var(--color-success); } .fc-range b.neg { color: var(--color-danger); }
        .fc-mid { color: var(--color-ink-3); font-size: 0.76rem; }
        .fc-assume { font-size: 0.7rem; color: var(--color-ink-3); margin-top: 8px; line-height: 1.55; word-break: keep-all; }
        .fc-assume b { color: var(--color-ink-2); font-weight: 700; }
        .sample-badge { font-size: 10px; font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 3px 8px; border-radius: 6px; margin-left: auto; }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
