// ONE-HUB v10 — 부동산 자산 대시보드 (PWA, onehub-realestate 5002 연동)
// ETF 대시보드와 동일 패턴. ONE Score 랭킹/시장 브리핑/저평가/거시. 확정 데이터는 진한색.
import { useEffect, useState } from "react";
import TopNav from "../../components/TopNav";
import { dedupBy } from "../../lib/useDedup";

const uk = (n) => (n == null ? "-" : `${Number(n).toFixed(2)}억`);
const pct = (n) => (n == null ? "-" : `${n > 0 ? "+" : ""}${Number(n).toFixed(1)}%`);
// [v10 UI §1] 시맨틱: 저평가=초록(under), 고평가=빨강(over), 적정=회색(fair)
//   매수검토=파랑(buy·주요액션), 관망=회색(watch·중립)
const vtag = (v) => (v?.includes("저평가") ? "under" : v?.includes("고평가") ? "over" : "fair");
const jtag = (d) => (d?.includes("매수") ? "buy" : "watch");

export default function RealEstateDashboard() {
  const [brief, setBrief] = useState(null);
  const [rank, setRank] = useState(null);
  const [macro, setMacro] = useState(null);
  const [feed, setFeed] = useState(null); // [v11 #16] 최근 실거래 피드
  const [err, setErr] = useState(null);
  const [myC, setMyC] = useState("");   // [S5] 내 단지
  const [tgtC, setTgtC] = useState(""); // [S5] 갈아탈 목표 단지
  const [myProp, setMyProp] = useState(null); // [S5] 내 단지 상세(위저드 등록: 평형·동층·매수가·시점)
  const [wizOpen, setWizOpen] = useState(false); // [S5] 등록 위저드 열림
  const [wiz, setWiz] = useState({ name: "", pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" });
  const [budget, setBudget] = useState("");     // [S5] 스크리너 예산(억)
  const [jeonseRate, setJeonseRate] = useState("60"); // [S5] 전세가율(%) 가정
  const [moveScope, setMoveScope] = useState("region"); // [S5+] 이동 범위: complex/dong/region
  const [dbAreas, setDbAreas] = useState({}); // [S5+] 단지→평형(전용면적) 백엔드 로딩(complex-areas)
  const [dongMap, setDongMap] = useState({}); // [S5+] 단지→법정동 백엔드 로딩(complex-dongs)

  useEffect(() => {
    const g = (fn) => fetch(`/api/pwa/re/${fn}`).then((r) => r.json());
    Promise.all([g("briefing"), g("ranking"), g("macro"), g("feed")])
      .then(([b, r, m, f]) => {
        if (b.error) setErr(b.error);
        setBrief(b); setRank(r); setMacro(m); setFeed(f);
      })
      .catch((e) => setErr(e.message));
    // [S5+] 단지→법정동 매핑(같은 동 필터). 미배포 시 조용히 폴백.
    g("complexDongs").then((d) => {
      const map = d?.map || (Array.isArray(d?.items) ? Object.fromEntries(d.items.map((x) => [x.단지명, x.법정동])) : null);
      if (map && typeof map === "object") setDongMap(map);
    }).catch(() => {});
    try {
      setMyC(localStorage.getItem("onehub_re_my") || "");
      setTgtC(localStorage.getItem("onehub_re_target") || "");
      const mp = localStorage.getItem("onehub_re_my_property");
      if (mp) { const o = JSON.parse(mp); setMyProp(o); if (o?.name && !localStorage.getItem("onehub_re_my")) setMyC(o.name); }
      const bg = localStorage.getItem("onehub_re_budget"); if (bg != null) setBudget(bg);
      const jr = localStorage.getItem("onehub_re_jeonse"); if (jr != null) setJeonseRate(jr);
      const sc = localStorage.getItem("onehub_re_scope"); if (sc) setMoveScope(sc);
    } catch (e) {}
  }, []);
  // [S3] 빠른입력(FAB) 저장 시 내 단지 즉시 재로드
  useEffect(() => {
    const reload = () => {
      try {
        const mp = localStorage.getItem("onehub_re_my_property");
        if (mp) { const o = JSON.parse(mp); setMyProp(o); if (o?.name) setMyC(o.name); }
      } catch (e) {}
    };
    window.addEventListener("onehub-assets-change", reload);
    return () => window.removeEventListener("onehub-assets-change", reload);
  }, []);
  // [S5+] 선택/보유 단지의 실거래 평형(전용면적)을 백엔드에서 로딩(complex-areas). 미배포 시 feed 폴백.
  useEffect(() => {
    const names = [wizOpen ? wiz.name : null, myProp?.name].filter(Boolean);
    names.forEach((nm) => {
      if (!nm || dbAreas[nm] !== undefined) return;
      setDbAreas((m) => ({ ...m, [nm]: null })); // in-flight 마킹(중복 요청 방지)
      fetch(`/api/pwa/re/complexAreas?complex=${encodeURIComponent(nm)}`)
        .then((r) => r.json())
        .then((d) => {
          const areas = Array.isArray(d?.areas) ? d.areas.map((a) => ({
            m2: Math.round(Number(a.m2 ?? a.전용면적)),
            priceUk: a.rep_price_uk != null ? Number(a.rep_price_uk) : (a.rep_price_manwon != null ? Number(a.rep_price_manwon) / 10000 : null),
            n: a.n ?? null,
          })).filter((a) => a.m2 > 0) : null;
          setDbAreas((m) => ({ ...m, [nm]: areas && areas.length ? areas : null }));
          if (d?.법정동) setDongMap((m) => (m[nm] ? m : { ...m, [nm]: d.법정동 }));
        })
        .catch(() => setDbAreas((m) => ({ ...m, [nm]: null })));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wizOpen, wiz.name, myProp?.name]);
  const pickMy = (v) => { setMyC(v); try { localStorage.setItem("onehub_re_my", v); } catch (e) {} };
  const pickTgt = (v) => { setTgtC(v); try { localStorage.setItem("onehub_re_target", v); } catch (e) {} };
  const changeBudget = (v) => { setBudget(v); try { localStorage.setItem("onehub_re_budget", v); } catch (e) {} };
  const changeJeonse = (v) => { setJeonseRate(v); try { localStorage.setItem("onehub_re_jeonse", v); } catch (e) {} };
  const openWiz = () => { setWiz(myProp ? { name: myProp.name || "", pyeong: myProp.pyeong || "", dongfloor: myProp.dongfloor || "", buyUk: myProp.buyUk || "", buyMonth: myProp.buyMonth || "" } : { name: myC || "", pyeong: "", dongfloor: "", buyUk: "", buyMonth: "" }); setWizOpen(true); };
  const saveWiz = () => {
    const name = String(wiz.name || "").trim();
    if (!name) return;
    const obj = { name, pyeong: wiz.pyeong, dongfloor: wiz.dongfloor, buyUk: wiz.buyUk, buyMonth: wiz.buyMonth };
    setMyProp(obj); setMyC(name);
    try { localStorage.setItem("onehub_re_my_property", JSON.stringify(obj)); localStorage.setItem("onehub_re_my", name); } catch (e) {}
    setWizOpen(false);
  };

  const mac = macro?.latest;

  // [S5+] DB(raw_transactions 기반 feed)에서 단지별 전용면적(㎡)·평형 옵션 로딩
  const areaMap = (() => {
    const m = {};
    (feed?.feed || []).forEach((f) => {
      const nm = f.단지명, a = Math.round(Number(f.전용면적));
      if (!nm || !(a > 0)) return;
      (m[nm] = m[nm] || new Map()).set(a, { m2: a, priceUk: Number(f.거래금액_억) || null, floor: f.층 });
    });
    // 값 배열로 변환(면적 오름차순)
    const out = {};
    Object.keys(m).forEach((nm) => { out[nm] = [...m[nm].values()].sort((x, y) => x.m2 - y.m2); });
    return out;
  })();
  // 평형 옵션: 백엔드(complex-areas) 우선 → 없으면 feed 유도치
  const areaOptsFor = (name) => (Array.isArray(dbAreas[name]) && dbAreas[name].length ? dbAreas[name] : (areaMap[name] || []));
  // 전용㎡ → 대략 평(공급 관례 근사): 전용㎡ ÷ 3.3058 후 전용률 0.74 역산 ≈ ㎡/2.45
  const m2ToPyeong = (m2) => Math.round(Number(m2) / 3.3058 / 0.74);
  // 법정동: 백엔드(complex-dongs) 우선 → 랭킹 필드 → 브리핑 지역
  const dongOf = (name) => {
    if (dongMap[name]) return dongMap[name];
    const row = (rank?.ranking || []).find((r) => r.단지명 === name);
    return row?.법정동 || row?.법정동명 || brief?.region || null;
  };
  const myDong = myProp?.name ? dongOf(myProp.name) : (brief?.region || null);
  const changeScope = (s) => { setMoveScope(s); try { localStorage.setItem("onehub_re_scope", s); } catch (e) {} };

  return (
    <div className="re pwa-shell">
      <TopNav active="realestate" />

      {/* 1) HERO — 시장 브리핑 (다크 네이비 히어로) */}
      <section className="hero">
        <div className="eyebrow">
          <span className="lbl">🏢 시장 브리핑{brief?.region ? ` · ${brief.region}` : ""}</span>
          <span className="live">LIVE</span>
        </div>
        {brief && !brief.error ? (
          <>
            <div className="big">{brief.phase}</div>
            <div className="brief-lead">대장 단지 <b>{brief.leader}</b> · {uk(brief.leader_price)}</div>
            <div className="brief-stats">
              <div className="bstat"><span>분기</span><b>{pct(brief.chg_q)}</b></div>
              <div className="bstat"><span>연간</span><b>{pct(brief.chg_yr)}</b></div>
            </div>
          </>
        ) : (
          <div className="brief-lead">{err ? "데이터 로드 오류" : "불러오는 중…"}</div>
        )}
      </section>

      {/* [§3-7 피드백15] #1 결론 한 줄 — 국면 + 저평가 1위(위계 확립) */}
      {brief && !brief.error && (() => {
        const topU = brief.under?.[0];
        return (
          <div className="re-verdict">
            <div className="rv-h"><span className="rv-lbl">📌 이 지역 한 줄 결론</span><span className={`rv-phase ${jtag(brief.phase)}`}>{String(brief.phase || "").replace(/\s*국면\s*$/, "")} 국면</span></div>
            <div className="rv-sub">
              대장 <b>{brief.leader}</b> {uk(brief.leader_price)} · 분기 <b>{pct(brief.chg_q)}</b>
              {topU && <> · 저평가 1위 <b className="rv-under">{topU.단지명} +{Number(topU.gap).toFixed(1)}%</b></>}
            </div>
          </div>
        );
      })()}

      {/* [S5] 내 단지 — 미등록: 위저드 CTA / 등록됨: 상세 요약(매수가 vs 현재 AVM) */}
      {!myProp ? (
        <div className="cta-slim" onClick={openWiz}><span className="cta-txt">🏠 내 단지를 등록하면 <b>평가손익·갈아타기·스크리너</b>에 반영됩니다</span><span className="arr">→</span></div>
      ) : (() => {
        const cur = rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명).find((o) => o.단지명 === myProp.name) : null;
        const curUk = cur ? Number(cur.avm_total_uk || 0) : null;
        const buyUk = Number(myProp.buyUk || 0) || null;
        const pnl = curUk != null && buyUk != null ? curUk - buyUk : null;
        const pnlPct = pnl != null && buyUk ? (pnl / buyUk) * 100 : null;
        return (
          <section className="card myprop-card">
            <div className="mp-h">
              <div className="mp-title">🏠 내 단지 <b>{myProp.name}</b></div>
              <button className="mp-edit" onClick={openWiz}>수정</button>
            </div>
            <div className="mp-meta">
              {myProp.pyeong && <span>{myProp.pyeong}평</span>}
              {myProp.dongfloor && <span>{myProp.dongfloor}</span>}
              {myProp.buyMonth && <span>{myProp.buyMonth} 매수</span>}
              {buyUk != null && <span>매수 {uk(buyUk)}</span>}
            </div>
            {curUk != null ? (
              <div className="mp-pnl">
                <div className="mp-now"><span>현재 AVM</span><b>{uk(curUk)}</b></div>
                <div className={`mp-diff ${pnl >= 0 ? "pos" : "neg"}`}>
                  <span>평가손익<em>추정</em></span><b>{pnl >= 0 ? "+" : ""}{uk(pnl)}{pnlPct != null ? ` · ${pct(pnlPct)}` : ""}</b>
                </div>
              </div>
            ) : (
              <div className="mp-nomatch">랭킹에 없는 단지입니다 — 갭·스크리너는 목록 단지 기준으로 계산됩니다. (AVM 매칭은 실거래 축적 시)</div>
            )}
            <div className="mp-note">매수가·시점은 로컬에만 저장되며, 평가손익은 현재 AVM 기준 <b>추정</b>(확정 아님)입니다.</div>
          </section>
        );
      })()}

      {/* [정리] 기존 '갈아타기 갭' 카드는 아래 스크리너의 '같은 동/같은 단지'와 중복되어 제거.
          갈아타기 소요자금은 스크리너에서 이동 범위별로 계산한다. */}

      {/* [S5+] 갈아타기·투자 스크리너 — 이동 범위(같은 단지/같은 동/지역 변경)별 최적화 */}
      {rank?.ranking?.length > 0 && (() => {
        const opts = dedupBy(rank.ranking, (c) => c.단지ID || c.단지명);
        const myRow = myProp?.name ? opts.find((o) => o.단지명 === myProp.name) : null;
        const myAvm = myRow ? Number(myRow.avm_total_uk || 0) : null;
        const needMy = (moveScope === "complex" || moveScope === "dong") && !myProp?.name;
        const SCOPES = [
          ["complex", "같은 단지", "평형 갈아타기"],
          ["dong", "같은 동", myDong ? `${myDong} 내 이동` : "동 내 이동"],
          ["region", "지역 변경", "타 지역·투자"],
        ];
        const gapCell = (v) => (v == null ? "-" : v > 0 ? `+${uk(v)}` : v < 0 ? `−${uk(-v)}` : "동일");
        return (
          <section className="card scr-card">
            <div className="label">🔎 갈아타기·투자 스크리너 <span className="sub">이동 범위별</span></div>
            <div className="scope-chips">
              {SCOPES.map(([k, l, d]) => (
                <button key={k} className={`scope-chip ${moveScope === k ? "on" : ""}`} onClick={() => changeScope(k)}>
                  <b>{l}</b><span>{d}</span>
                </button>
              ))}
            </div>

            {needMy ? (
              <div className="gap-empty">이 범위는 <b>내 단지</b> 기준으로 계산됩니다. 먼저 내 단지를 등록하세요.
                <button className="scr-reg" onClick={openWiz}>내 단지 등록 →</button>
              </div>
            ) : moveScope === "complex" ? (() => {
              const areas = areaOptsFor(myProp?.name);
              const myArea = areas.find((a) => String(a.m2) === String(myProp?.pyeong));
              const myPrice = myArea?.priceUk ?? myAvm ?? null;
              if (!areas.length) return <div className="gap-empty"><b>{myProp?.name}</b>의 평형별 실거래가 아직 부족합니다(최근 거래 축적 시 표시). ‘같은 동·지역 변경’을 이용해 보세요.</div>;
              return (
                <>
                  <div className="scr-head"><span>평형(전용)</span><span>실거래</span><span>갈아타기 자금</span></div>
                  {areas.map((a) => {
                    const diff = myPrice != null && a.priceUk != null ? a.priceUk - myPrice : null;
                    const mine = String(a.m2) === String(myProp?.pyeong);
                    return (
                      <div className="scr-row" key={a.m2}>
                        <span className="scr-name">전용 {a.m2}㎡ <span className="scr-py">약 {m2ToPyeong(a.m2)}평</span>{mine && <span className="scr-mine">내 평형</span>}</span>
                        <span className="scr-avm">{a.priceUk != null ? uk(a.priceUk) : "-"}</span>
                        <span className={`scr-gap ${diff != null && diff <= 0 ? "ok" : ""}`}>{mine ? "—" : gapCell(diff)}</span>
                      </div>
                    );
                  })}
                  <div className="note"><b>{myProp?.name}</b> 평형별 최근 실거래(raw_transactions) 기준. 갈아타기 자금 = 목표 평형 − 내 평형 실거래. 층·향·수리에 따라 실제가는 다릅니다(확정 아님).</div>
                </>
              );
            })() : moveScope === "dong" ? (() => {
              const cands = opts.filter((o) => o.단지명 !== myProp?.name && dongOf(o.단지명) === myDong)
                .map((o) => ({ ...o, need: myAvm != null ? Number(o.avm_total_uk || 0) - myAvm : null }))
                .sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0)).slice(0, 8);
              if (!cands.length) return <div className="gap-empty">{myDong ? <><b>{myDong}</b> 내 다른 단지 데이터가 부족합니다.</> : "동 정보를 불러오지 못했습니다."} ‘지역 변경’을 이용해 보세요.</div>;
              return (
                <>
                  <div className="scr-head"><span>단지</span><span>매매(AVM)</span><span>갈아타기 자금</span></div>
                  {cands.map((o, i) => (
                    <div className="scr-row" key={`${o.단지ID || o.단지명}-${i}`}>
                      <span className="scr-name">{o.단지명} <span className={`vtag ${vtag(o.valuation)}`}>{o.valuation}</span></span>
                      <span className="scr-avm">{uk(o.avm_total_uk)}</span>
                      <span className={`scr-gap ${o.need != null && o.need <= 0 ? "ok" : ""}`}>{gapCell(o.need)}</span>
                    </div>
                  ))}
                  <div className="note">{myDong ? <><b>{myDong}</b> 내 이동 기준. </> : null}갈아타기 자금 = 목표 매매(AVM) − 내 단지 매매. 회귀 근사·lag=0·확정 아님.</div>
                </>
              );
            })() : (() => {
              const jr = Math.max(0, Math.min(100, Number(jeonseRate) || 0)) / 100;
              const bg = Number(budget) || 0;
              const scored = opts.map((o) => ({ ...o, gapInvest: Number(o.avm_total_uk || 0) * (1 - jr) })).filter((o) => o.gapInvest > 0);
              const matched = (bg > 0 ? scored.filter((o) => o.gapInvest <= bg) : scored).sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0)).slice(0, 6);
              return (
                <>
                  <div className="scr-inputs">
                    <label className="scr-in"><span>예산(억)</span><input type="number" inputMode="decimal" placeholder="예: 3" value={budget} onChange={(e) => changeBudget(e.target.value)} /></label>
                    <label className="scr-in"><span>전세가율(%)</span><input type="number" inputMode="numeric" placeholder="60" value={jeonseRate} onChange={(e) => changeJeonse(e.target.value)} /></label>
                  </div>
                  {matched.length > 0 ? (
                    <>
                      <div className="scr-head"><span>단지</span><span>매매(AVM)</span><span>갭투자금</span></div>
                      {matched.map((o, i) => (
                        <div className="scr-row" key={`${o.단지ID || o.단지명}-${i}`}>
                          <span className="scr-name">{o.단지명} <span className={`vtag ${vtag(o.valuation)}`}>{o.valuation}</span></span>
                          <span className="scr-avm">{uk(o.avm_total_uk)}</span>
                          <span className={`scr-gap ${bg > 0 && o.gapInvest <= bg ? "ok" : ""}`}>{uk(o.gapInvest)}</span>
                        </div>
                      ))}
                      <div className="note">갭투자금 = 매매(AVM) × (1 − 전세가율{Math.round(jr * 100)}%). 전세가율은 <b>사용자 가정치</b>(상대가치·추정·확정 아님).</div>
                    </>
                  ) : (
                    <div className="gap-empty">예산 범위에 맞는 단지가 없습니다. 예산·전세가율을 조정해 보세요.</div>
                  )}
                </>
              );
            })()}
          </section>
        );
      })()}

      {/* [§3-2 원칙1] 포트폴리오 합계는 홈·AI자산 2곳에만. 부동산 페이지는 부동산 슬라이스만 표시(피드백14) */}

      {/* 2) ONE Score 랭킹 */}
      {rank?.ranking?.length > 0 && (
        <section className="card">
          <div className="label">🏆 ONE Score 랭킹 <span className="sub">단지별 종합점수</span></div>
          {/* [§3-7] 순위 중복 버그 수정 — one_score 내림차순 정렬 + 단지명 중복 제거 후 순번 부여 */}
          {(() => {
            const seen = new Set();
            const ranking = [...rank.ranking]
              .sort((a, b) => (b.one_score ?? 0) - (a.one_score ?? 0))
              .filter((c) => { if (seen.has(c.단지명)) return false; seen.add(c.단지명); return true; });
            // [S7.5] 한 줄 근거용 룩업 — 저평가 gap(회귀 대비) + 최근 실거래 변동
            const underMap = new Map((brief?.under || []).map((u) => [u.단지명, u]));
            const feedMap = new Map();
            (feed?.feed || []).forEach((f) => { if (!feedMap.has(f.단지명)) feedMap.set(f.단지명, f); });
            return ranking.map((c, i) => {
              // 카드 간 연결감: 최근 실거래 변동 · 회귀 대비 상승여력을 한 줄로
              const fd = feedMap.get(c.단지명);
              const ud = underMap.get(c.단지명);
              const bits = [];
              if (fd?.거래일 && fd?.변동률 != null) bits.push(`${String(fd.거래일).slice(5)} ${fd.변동률 > 0 ? "+" : ""}${fd.변동률}%`);
              if (ud?.gap != null) bits.push(`회귀 대비 +${Number(ud.gap).toFixed(1)}%`);
              return (
              <div className="rrow" key={`${c.단지명}-${i}`}>
                <span className="rk">{i + 1}</span>
                <span className="rmid">
                  <span className="rname">{c.단지명} <span className={`vtag ${vtag(c.valuation)}`}>{c.valuation}</span></span>
                  <span className="rsub">{uk(c.avm_total_uk)}{bits.length > 0 && <span className="rreason"> · {bits.join(" · ")}</span>}</span>
                </span>
                <span className="rright">
                  <span className="rscore">{c.one_score}</span>
                  <span className={`jtag ${jtag(c.decision)}`}>{c.decision}</span>
                </span>
              </div>
              );
            });
          })()}
          <div className="note">업데이트 {rank.ranking[0]?.updated} · AVM=자동가치추정 · <b>lag=0 상대가치 기준(전파모델 미사용·확정 아님)</b>. ONE Score는 구성요소 종합이며 블랙박스가 아닙니다.</div>
        </section>
      )}

      {/* 2.5) 최근 실거래 피드 (#16) — raw_transactions 기반, 동일 단지·평형 직전 대비 변동률 */}
      {feed?.feed?.length > 0 && (
        <section className="card">
          <div className="label">📈 최근 실거래 <span className="sub">동일 단지·평형 직전 거래 대비</span></div>
          {feed.feed.slice(0, 8).map((f, i) => (
            <div className="frow" key={`${f.단지명}-${f.거래일}-${i}`}>
              <div className="fmid">
                <div className="fname">{f.단지명}</div>
                <div className="fsub">{f.전용면적}㎡ · {f.층 ? `${f.층}층` : "-"} · {f.건축연도 ? `${f.건축연도}년` : "-"} · {f.거래일?.slice(5)}</div>
              </div>
              <div className="fright">
                <div className="fprice">{f.거래금액_억}억</div>
                {f.변동률 != null && (
                  <div className={`fchg ${f.변동률 > 0 ? "up" : f.변동률 < 0 ? "dn" : "fl"}`}>
                    {f.변동률 > 0 ? "▲" : f.변동률 < 0 ? "▼" : "−"}{Math.abs(f.변동률)}%
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="note">{feed.note}{feed.updated ? ` · 업데이트 ${feed.updated}` : ""}</div>
        </section>
      )}

      {/* 3) 저평가 후보 */}
      {brief?.under?.length > 0 && (
        <section className="card">
          <div className="label">💎 저평가 후보 <span className="sub">현재가 vs 회귀예측</span></div>
          {brief.under.slice(0, 6).map((u) => (
            <div className="urow" key={u.단지명}>
              <div>
                <div className="uname">{u.단지명}</div>
                <div className="usub">{uk(u.cur)} → 예측 <b>{uk(u.pred)}</b> · R² {Number(u.r2).toFixed(2)}</div>
              </div>
              <div className="ugap">+{Number(u.gap).toFixed(1)}%</div>
            </div>
          ))}
          <div className="note">gap = 예측 대비 상승여력 · <b>회귀 근사 · lag=0 상대가치</b> · 전파모델(lag_map) 미사용 · 확정 아님. R² = 적합도.</div>
        </section>
      )}

      {/* 4) 거시 */}
      {mac && (
        <section className="card">
          <div className="label">🌐 거시 환경 <span className="sub">{mac.연월}</span></div>
          <div className="chips">
            <span className="chip">KOSPI <b>{Math.round(mac.kospi).toLocaleString()}</b></span>
            <span className="chip">기준금리 <b>{mac.base_rate}%</b></span>
            <span className="chip">정책 <b>{mac.policy_stance}</b></span>
          </div>
          <div className="note">{mac.kospi_src || "연말 종가 보간(근사·월별 정밀치 아님)."}</div>
        </section>
      )}

      {/* [S5] 내 단지 등록 위저드 — 자동완성·평형·동층·매수가·시점 */}
      {wizOpen && (
        <div className="wiz-scrim" onClick={() => setWizOpen(false)}>
          <div className="wiz" onClick={(e) => e.stopPropagation()}>
            <div className="wiz-h">🏠 내 단지 등록<button className="wiz-x" onClick={() => setWizOpen(false)} aria-label="닫기">✕</button></div>
            {/* [S5+] 단지명 = DB(랭킹) 로딩 select */}
            <label className="wiz-f"><span>단지명 <em>실거래 DB</em></span>
              <select value={wiz.name} onChange={(e) => setWiz((w) => ({ ...w, name: e.target.value, pyeong: "" }))}>
                <option value="">단지 선택</option>
                {(rank?.ranking ? dedupBy(rank.ranking, (c) => c.단지ID || c.단지명) : []).map((o) => <option key={o.단지ID || o.단지명} value={o.단지명}>{o.단지명}</option>)}
              </select>
            </label>
            <div className="wiz-row">
              {/* [S5+] 평형 = 선택 단지의 실거래 전용면적 옵션 로딩(없으면 직접입력) */}
              <label className="wiz-f"><span>평형 <em>{areaOptsFor(wiz.name).length ? "실거래 DB" : "직접입력"}</em></span>
                {areaOptsFor(wiz.name).length ? (
                  <select value={wiz.pyeong} onChange={(e) => setWiz((w) => ({ ...w, pyeong: e.target.value }))}>
                    <option value="">평형 선택</option>
                    {areaOptsFor(wiz.name).map((a) => <option key={a.m2} value={a.m2}>전용 {a.m2}㎡ (약 {m2ToPyeong(a.m2)}평){a.priceUk ? ` · ${a.priceUk}억` : ""}</option>)}
                  </select>
                ) : (
                  <input type="number" inputMode="numeric" value={wiz.pyeong} onChange={(e) => setWiz((w) => ({ ...w, pyeong: e.target.value }))} placeholder="전용㎡ 또는 평" />
                )}
              </label>
              <label className="wiz-f"><span>동/층</span>
                <input value={wiz.dongfloor} onChange={(e) => setWiz((w) => ({ ...w, dongfloor: e.target.value }))} placeholder="101동 15층" /></label>
            </div>
            <div className="wiz-row">
              <label className="wiz-f"><span>매수가(억)</span>
                <input type="number" inputMode="decimal" value={wiz.buyUk} onChange={(e) => setWiz((w) => ({ ...w, buyUk: e.target.value }))} placeholder="8.5" /></label>
              <label className="wiz-f"><span>매수 시점</span>
                <input type="month" value={wiz.buyMonth} onChange={(e) => setWiz((w) => ({ ...w, buyMonth: e.target.value }))} /></label>
            </div>
            <button className="wiz-save" onClick={saveWiz} disabled={!String(wiz.name || "").trim()}>저장</button>
            <div className="wiz-note">입력값은 이 기기에만 저장됩니다(localStorage). 평가손익·갭은 현재 AVM 기준 <b>추정</b>입니다.</div>
          </div>
        </div>
      )}

      <div className="foot">실거래 기반 확정 지표 + 회귀 예측(근사). 예측치는 참고용이며 투자판단은 본인 책임.</div>

      <style jsx>{`
        .re { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 24px); font-family: var(--font-sans); color: var(--color-ink); }
        .err { background: var(--color-danger-soft); color: var(--color-danger); padding: 10px 12px; border-radius: 10px; font-size: 0.82rem; margin-bottom: 12px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); padding: 18px; margin-bottom: 14px; box-shadow: var(--shadow-card); }
        /* HERO — 시장 브리핑 */
        .hero { background: linear-gradient(135deg, var(--hero-grad-1), var(--hero-grad-2)); color: var(--hero-ink); border-radius: var(--radius-hero); padding: 20px 18px; box-shadow: var(--shadow-float); margin-bottom: 14px; }
        .hero .eyebrow { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 14px; }
        .hero .lbl { font-size: 12px; font-weight: 700; color: var(--hero-ink-sub); }
        .live { background: var(--color-success); color: #04351f; font-size: 9px; font-weight: 800; padding: 3px 7px; border-radius: 5px; letter-spacing: .5px; }
        .hero .big { font-size: 28px; font-weight: 800; letter-spacing: -.6px; line-height: 1; }
        .brief-lead { font-size: 12.5px; color: var(--hero-ink-soft); margin-top: 11px; }
        .brief-lead b { color: var(--hero-ink); font-weight: 700; }
        .brief-stats { display: flex; gap: 9px; margin-top: 16px; }
        .bstat { flex: 1; background: var(--hero-fill); border: 1px solid var(--hero-fill-line); border-radius: 13px; padding: 11px 13px; }
        .bstat span { display: block; font-size: 11px; color: var(--hero-ink-sub); font-weight: 600; margin-bottom: 4px; }
        .bstat b { font-size: 15px; font-weight: 800; color: var(--hero-accent); }
        /* [§3-7] #1 결론 strip */
        .re-verdict { background: var(--color-card); border: 1px solid var(--color-line); border-left: 4px solid var(--color-primary); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 14px 16px; margin-bottom: 12px; }
        .rv-h { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
        .rv-lbl { font-size: 0.74rem; font-weight: 700; color: var(--color-ink-2); }
        .rv-phase { font-size: 0.8rem; font-weight: 800; padding: 3px 10px; border-radius: 8px; }
        .rv-phase.watch { background: var(--color-card-soft); color: var(--color-ink-2); }
        .rv-phase.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .rv-sub { font-size: 0.82rem; color: var(--color-ink-2); margin-top: 8px; line-height: 1.5; word-break: keep-all; }
        .rv-sub b { color: var(--color-ink); font-weight: 700; }
        .rv-under { color: var(--color-success) !important; }
        /* slim CTA */
        .cta-slim { display: flex; align-items: center; gap: 10px; background: var(--color-primary-soft); border-radius: 14px; padding: 13px 15px; margin-bottom: 14px; font-size: 12.5px; color: var(--color-ink-2); font-weight: 600; cursor: pointer; line-height: 1.5; }
        .cta-txt { flex: 1; word-break: keep-all; }
        .cta-slim b { color: var(--color-primary); font-weight: 700; }
        .cta-slim .arr { color: var(--color-primary); font-weight: 800; flex-shrink: 0; }
        /* [S5] 갈아타기 갭 트래커 */
        .gap-selects { display: flex; align-items: flex-end; gap: 8px; }
        .gap-sel { flex: 1; display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .gap-sel select { border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 8px; font-size: 0.82rem; font-family: var(--font-sans); color: var(--color-ink); }
        .gap-sel select:focus { outline: none; border-color: var(--color-primary); }
        .gap-arrow { font-size: 1rem; font-weight: 800; color: var(--color-ink-3); padding-bottom: 9px; }
        .gap-result { margin-top: 14px; }
        .gap-amt { font-size: 0.9rem; font-weight: 700; color: var(--color-ink-2); display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; }
        .gap-amt b { font-size: 1.3rem; font-weight: 800; font-family: var(--font-display, var(--font-sans)); }
        .gap-amt b.pos { color: var(--color-primary); } .gap-amt b.neg { color: var(--color-success); }
        .gap-dir { font-size: 0.7rem; font-weight: 600; color: var(--color-ink-3); }
        .gap-rows { display: flex; flex-direction: column; gap: 6px; margin-top: 11px; }
        .gap-row { display: flex; align-items: center; justify-content: space-between; background: var(--color-card-soft); border-radius: 9px; padding: 8px 12px; font-size: 0.8rem; color: var(--color-ink); }
        .gap-row b { font-family: ui-monospace, monospace; font-weight: 800; }
        .gap-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.55; word-break: keep-all; }
        .gap-note b { color: var(--color-ink-2); font-weight: 700; }
        .gap-empty { margin-top: 12px; font-size: 0.76rem; color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .gap-empty b { color: var(--color-ink); font-weight: 700; }
        /* [S5] 갭 밴드(상대가치·추정) */
        .gap-band { margin-top: 14px; }
        .gb-h { display: flex; align-items: center; gap: 8px; margin-bottom: 7px; }
        .gb-lbl { font-size: 0.72rem; font-weight: 800; color: var(--color-ink-2); }
        .gb-tag { font-size: 0.6rem; font-weight: 800; padding: 2px 7px; border-radius: 5px; background: var(--color-warning-soft); color: var(--color-warning-ink); }
        .gb-track { position: relative; height: 10px; background: var(--color-card-soft); border-radius: 999px; overflow: hidden; }
        .gb-fill { position: absolute; top: 0; bottom: 0; background: var(--color-primary-soft); }
        .gb-mid { position: absolute; top: -2px; bottom: -2px; width: 2px; background: var(--color-primary); transform: translateX(-1px); }
        .gb-scale { display: flex; justify-content: space-between; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 600; margin-top: 5px; }
        .gb-scale span:nth-child(2) { color: var(--color-primary); font-weight: 800; }
        /* [S5] 내 단지 요약 카드 */
        .myprop-card .mp-h { display: flex; align-items: center; justify-content: space-between; }
        .mp-title { font-size: 0.86rem; font-weight: 700; color: var(--color-ink-2); }
        .mp-title b { color: var(--color-ink); font-weight: 800; margin-left: 4px; }
        .mp-edit { border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); border-radius: 8px; padding: 5px 12px; font-size: 0.72rem; font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .mp-meta { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 9px; }
        .mp-meta span { font-size: 0.68rem; font-weight: 700; background: var(--color-card-soft); color: var(--color-ink-2); border-radius: 7px; padding: 4px 9px; }
        .mp-pnl { display: flex; gap: 10px; margin-top: 12px; }
        .mp-now, .mp-diff { flex: 1; background: var(--color-card-soft); border-radius: 11px; padding: 11px 13px; }
        .mp-now span, .mp-diff span { display: block; font-size: 0.66rem; color: var(--color-ink-3); font-weight: 600; margin-bottom: 4px; }
        .mp-now b, .mp-diff b { font-size: 1.05rem; font-weight: 800; }
        .mp-diff em { font-style: normal; font-size: 0.56rem; font-weight: 800; background: var(--color-warning-soft); color: var(--color-warning-ink); padding: 1px 5px; border-radius: 4px; margin-left: 5px; vertical-align: middle; }
        .mp-diff.pos b { color: var(--color-success); } .mp-diff.neg b { color: var(--color-danger); }
        .mp-nomatch { font-size: 0.72rem; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 10px; padding: 10px 12px; margin-top: 11px; line-height: 1.5; word-break: keep-all; }
        .mp-note { font-size: 0.64rem; color: var(--color-ink-3); margin-top: 10px; line-height: 1.5; word-break: keep-all; }
        .mp-note b { color: var(--color-ink-2); font-weight: 700; }
        /* [S5] 투자아파트 스크리너 */
        /* [S5+] 이동 범위 칩 */
        .scope-chips { display: flex; gap: 6px; margin-bottom: 14px; }
        .scope-chip { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; border: 1px solid var(--color-line); background: var(--color-card); border-radius: 12px; padding: 9px 4px; cursor: pointer; font-family: var(--font-sans); }
        .scope-chip b { font-size: 0.8rem; font-weight: 800; color: var(--color-ink-2); }
        .scope-chip span { font-size: 0.6rem; font-weight: 600; color: var(--color-ink-3); white-space: nowrap; }
        .scope-chip.on { background: var(--color-primary); border-color: var(--color-primary); }
        .scope-chip.on b, .scope-chip.on span { color: #fff; }
        .scr-py { font-size: 0.66rem; font-weight: 600; color: var(--color-ink-3); }
        .scr-mine { font-size: 0.58rem; font-weight: 800; background: var(--color-primary-soft); color: var(--color-primary); padding: 1px 6px; border-radius: 5px; }
        .scr-reg { display: block; margin-top: 10px; border: none; background: var(--color-primary); color: #fff; border-radius: 10px; padding: 9px 14px; font-size: 0.78rem; font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .scr-inputs { display: flex; gap: 8px; margin-bottom: 12px; }
        /* [모바일 정렬] flex:1 + min-width:0 로 숫자 input이 좁은 화면에서 균등 축소되게(오버플로우 방지) */
        .scr-in { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 0.68rem; color: var(--color-ink-3); font-weight: 700; }
        .scr-in input { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 9px; padding: 9px 10px; font-size: 0.84rem; font-family: var(--font-sans); color: var(--color-ink); }
        .scr-in input:focus { outline: none; border-color: var(--color-primary); }
        .scr-head { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; font-size: 0.64rem; color: var(--color-ink-3); font-weight: 700; padding-bottom: 6px; border-bottom: 1px solid var(--color-line); }
        .scr-head span:nth-child(2), .scr-head span:nth-child(3) { text-align: right; min-width: 56px; }
        .scr-row { display: grid; grid-template-columns: 1fr auto auto; gap: 10px; align-items: center; padding: 10px 0; border-bottom: 1px solid var(--color-line); }
        .scr-name { font-size: 0.82rem; font-weight: 700; color: var(--color-ink); display: flex; align-items: center; gap: 6px; min-width: 0; }
        .scr-avm { font-size: 0.8rem; font-weight: 700; color: var(--color-ink-2); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); font-family: ui-monospace, monospace; text-align: right; min-width: 56px; }
        .scr-gap.ok { color: var(--color-success); }
        /* [S5] 등록 위저드 바텀시트 */
        .wiz-scrim { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: flex-end; justify-content: center; }
        .wiz { width: 100%; max-width: 480px; background: var(--color-card); border-radius: 20px 20px 0 0; padding: 20px 18px calc(env(safe-area-inset-bottom, 0px) + 20px); box-shadow: var(--shadow-float); }
        .wiz-h { display: flex; align-items: center; justify-content: space-between; font-size: 1rem; font-weight: 800; color: var(--color-ink); margin-bottom: 16px; }
        .wiz-x { border: none; background: var(--color-card-soft); color: var(--color-ink-2); width: 30px; height: 30px; border-radius: 50%; font-size: 0.9rem; cursor: pointer; }
        .wiz-f { display: flex; flex-direction: column; gap: 5px; font-size: 0.7rem; color: var(--color-ink-3); font-weight: 700; margin-bottom: 11px; flex: 1 1 0; min-width: 0; }
        .wiz-f em { font-style: normal; font-size: 0.6rem; font-weight: 700; color: var(--color-primary); margin-left: 5px; }
        .wiz-f input, .wiz-f select { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--color-line); background: var(--color-bg); border-radius: 10px; padding: 11px 12px; font-size: 0.9rem; font-family: var(--font-sans); color: var(--color-ink); }
        .wiz-f select:focus { outline: none; border-color: var(--color-primary); }
        .wiz-f input:focus { outline: none; border-color: var(--color-primary); }
        .wiz-row { display: flex; gap: 10px; }
        .wiz-save { width: 100%; margin-top: 6px; border: none; border-radius: 12px; padding: 13px 0; font-size: 0.92rem; font-weight: 800; color: #fff; background: var(--color-primary); cursor: pointer; font-family: var(--font-sans); }
        .wiz-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .wiz-note { font-size: 0.66rem; color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; text-align: center; }
        .wiz-note b { color: var(--color-ink-2); font-weight: 700; }
        .label { font-size: 0.9rem; font-weight: 700; color: var(--color-ink); margin-bottom: 12px; }
        .sub { font-weight: 600; color: var(--color-ink-3); font-size: 0.68rem; margin-left: 6px; }
        /* ONE Score 랭킹 */
        .rrow { display: grid; grid-template-columns: 22px 1fr auto; align-items: center; gap: 10px; padding: 12px 0; border-top: 1px solid var(--color-line); }
        .rrow:first-of-type { border-top: none; }
        .rk { font-size: 13px; font-weight: 800; color: var(--color-ink-3); text-align: center; }
        .rmid { min-width: 0; }
        .rname { font-size: 14px; font-weight: 700; letter-spacing: -.2px; display: flex; align-items: center; gap: 6px; }
        .vtag { font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 6px; flex-shrink: 0; }
        .vtag.fair { background: var(--color-card-soft); color: var(--color-ink-2); }
        .vtag.under { background: var(--color-success-soft); color: var(--color-success-ink); }
        .vtag.over { background: var(--color-danger-soft); color: var(--color-danger); }
        .rsub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .rreason { color: var(--color-ink-2); font-weight: 600; }
        .rright { text-align: right; display: flex; flex-direction: column; align-items: flex-end; gap: 4px; }
        .rscore { font-size: 16px; font-weight: 800; color: var(--color-primary); line-height: 1; }
        .jtag { font-size: 10.5px; font-weight: 800; padding: 3px 9px; border-radius: 7px; }
        .jtag.buy { background: var(--color-primary-soft); color: var(--color-primary); }
        .jtag.watch { background: var(--color-card-soft); color: var(--color-ink-3); }
        /* 최근 실거래 피드 (#16) */
        .frow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 11px 0; border-top: 1px solid var(--color-line); }
        .frow:first-of-type { border-top: none; }
        .fmid { min-width: 0; }
        .fname { font-size: 13.5px; font-weight: 700; letter-spacing: -.2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .fsub { font-size: 11px; color: var(--color-ink-3); font-weight: 500; margin-top: 3px; }
        .fright { text-align: right; flex-shrink: 0; }
        .fprice { font-size: 14px; font-weight: 800; color: var(--color-ink); line-height: 1.1; }
        .fchg { font-size: 11px; font-weight: 800; margin-top: 2px; }
        .fchg.up { color: var(--color-danger); }
        .fchg.dn { color: var(--color-primary); }
        .fchg.fl { color: var(--color-ink-3); }
        /* 저평가 후보 */
        .urow { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 10px; padding: 13px 0; border-top: 1px solid var(--color-line); }
        .urow:first-of-type { border-top: none; }
        .uname { font-size: 14px; font-weight: 700; }
        .usub { font-size: 11.5px; color: var(--color-ink-3); font-weight: 500; margin-top: 4px; }
        .usub b { color: var(--color-ink-2); font-weight: 600; }
        .ugap { font-size: 17px; font-weight: 800; color: var(--color-success); text-align: right; }
        /* 거시 chips */
        .chips { display: flex; flex-wrap: wrap; gap: 8px; }
        .chip { font-size: 12px; font-weight: 700; color: var(--color-ink-2); background: var(--color-card-soft); border-radius: 11px; padding: 9px 13px; }
        .chip b { color: var(--color-primary); margin-left: 3px; }
        .note { font-size: 11px; color: var(--color-ink-3); line-height: 1.55; margin-top: 13px; padding-top: 12px; border-top: 1px solid var(--color-line); }
        .foot { font-size: 0.68rem; color: var(--color-ink-3); text-align: center; margin-top: 16px; line-height: 1.5; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
