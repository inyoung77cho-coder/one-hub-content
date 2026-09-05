// [S28-7] 정비소 — 운영자 엔진룸(심판석과 한 페이지, 운영자 게이트 뒤). /pwa/accuracy 를 흡수한 요약.
//   규칙별 성적표(표본 30 미만은 '판정 보류') + 승인 대기 제안(EngineProposals) + 전체 상세 링크.
//   과정(임계값·백테스트)은 여기(운영자)만. 사용자에게 나가는 건 심판석 하단 결과 요약 한 줄뿐.
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { samplePolicy } from "../lib/sampleSize";
import { aggregateByCategory } from "../lib/ruleMap";
import EngineProposals from "./EngineProposals";

export default function MaintenanceShop() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [funnel, setFunnel] = useState(null); // [S30-9] 가입 깔때기
  useEffect(() => {
    fetch("/api/pwa/accuracy?trader_id=A")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => setData({ ok: false }));
    fetch("/api/pwa/funnel-agg")
      .then((r) => r.json())
      .then((d) => setFunnel(d))
      .catch(() => setFunnel({ ok: false }));
  }, []);

  // [S30-9] 사용자 10명 미만이면 백분율 대신 건수(S29-9 규칙과 동일).
  const syncAgo = (ts) => {
    if (!ts) return "기록 없음";
    const m = Math.floor((Date.now() - Number(ts)) / 60000);
    if (m < 60) return `${m}분 전`;
    const h = Math.floor(m / 60);
    return h < 24 ? `⚠️ ${h}시간째 · 확인 필요` : `⚠️ ${Math.floor(h / 24)}일째 · 확인 필요`;
  };

  const s = data && data.ok ? data.summary : null;
  const cats = data && data.ok ? aggregateByCategory(data.by_reason) : [];

  return (
    <section className="ms">
      <div className="ms-lead">🔧 <b>정비소</b> · 엔진이 지난달보다 나아졌나 · 다음에 무엇을 고칠까 <span className="ms-op">운영자 전용</span></div>

      {/* [S30-9] 가입 깔때기 — 다섯 관문 인원 + 최대 이탈 구간. 10명 미만은 건수(백분율 금지). */}
      {funnel && funnel.ok && (
        <div className="ms-card">
          <div className="ms-h">가입 깔때기 <span className="ms-sub">동기화 사용자 {funnel.users}명 · 건수</span></div>
          <div className="ms-funnel">
            {funnel.steps.map((s, i) => (
              <span key={s} className="ms-fstep">
                <b>{funnel.counts[s]}</b><i>{funnel.labels[s]}</i>
                {i < funnel.steps.length - 1 && <span className="ms-farrow">→</span>}
              </span>
            ))}
          </div>
          {funnel.biggest_drop ? (
            <div className="ms-fdrop">가장 큰 이탈: <b>{funnel.biggest_drop.from_label} → {funnel.biggest_drop.to_label}</b> ({funnel.biggest_drop.from_n}명 중 {funnel.biggest_drop.drop}명 이탈)</div>
          ) : (
            <div className="ms-foot" style={{ marginTop: 6 }}>아직 이탈 구간을 판단할 데이터가 부족합니다.</div>
          )}
          {/* [S31-3] 공개 도구(로그인 밖) 조회·전환 — 익명 서버 카운터 */}
          {funnel.public && (
            <div className="ms-fpub">🌐 공개 도구 조회 <b>{funnel.public.tool_view}</b> · 가입 전환 <b>{funnel.public.tool_signup}</b></div>
          )}
          <div className="ms-fsync">user_state 마지막 동기화: {syncAgo(funnel.last_sync)}</div>
        </div>
      )}

      {/* 승인 대기 제안(백테스트·근거·한계 포함) */}
      <EngineProposals />

      {/* 차단 정확도 요약 + 규칙(사유)별 성적표 */}
      <div className="ms-card">
        <div className="ms-h">차단 정확도 <span className="ms-sub">표본 30건+ 만 판정</span></div>
        {!data ? (
          <div className="ms-q">불러오는 중…</div>
        ) : !data.ok || !s ? (
          <div className="ms-q">데이터 수집 중입니다.</div>
        ) : (
          <>
            <div className="ms-acc">전체 적중률 <b>{s.accuracy_pct != null ? `${s.accuracy_pct}%` : "—"}</b> <span className="ms-n">채점 {s.total_checked}건 · 총차단 {s.total_blocked}건</span></div>
            {cats.map((c, i) => {
              const pol = samplePolicy(c.scored);
              return (
                <div className="ms-row" key={i}>
                  <span className="ms-k">{c.label}</span>
                  {pol.learning
                    ? <span className="ms-hold">판정 보류 · {c.scored}/30</span>
                    : <span className="ms-p">{c.accuracy_pct != null ? `${c.accuracy_pct}%` : "—"} <span className="ms-n">{c.hits}/{c.scored}</span></span>}
                </div>
              );
            })}
            <button type="button" className="ms-link" onClick={() => router.push("/pwa/accuracy")}>전체 차단 내역·상세 →</button>
          </>
        )}
      </div>

      {/* [S28-9] 다른 엔진 관측 — 제안은 아직 없음(채점 기준 미정). 서버에 매일 적립 중. */}
      <div className="ms-card">
        <div className="ms-h">다른 엔진 관측 <span className="ms-sub">수집 중 · 제안 없음</span></div>
        <div className="ms-row"><span className="ms-k">🏠 부동산(적정가 vs 실거래 오차)</span><span className="ms-hold">수집 중</span></div>
        <div className="ms-row"><span className="ms-k">💹 ETF(추천 vs 4주 수익)</span><span className="ms-hold">수집 중 · 이력 축적</span></div>
        <div className="ms-foot" style={{ marginTop: 8 }}>주식 엔진과 달리 채점 기준부터 정해야 합니다. 기준 없이 제안을 만들면 근거 없는 숫자가 나오므로, 지금은 매일 관측만 쌓습니다.</div>
      </div>

      <div className="ms-foot">숫자는 표본이 충분할 때만 판정합니다. 2~3건으로 규칙을 바꾸면 노이즈를 학습합니다. 백테스트가 좋다고 미래가 좋은 것은 아닙니다.</div>

      <style jsx>{`
        .ms { }
        .ms-lead { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.55; margin: 4px 2px 12px; word-break: keep-all; }
        .ms-lead b { color: var(--color-ink); }
        .ms-op { font-size: var(--fs-1); font-weight: 800; color: var(--color-warning-ink, var(--color-warning)); background: var(--color-warning-soft); padding: 2px 7px; border-radius: var(--radius-sm); margin-left: 4px; }
        .ms-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .ms-h { font-weight: 800; font-size: var(--fs-4); color: var(--color-ink); margin-bottom: 12px; display: flex; align-items: baseline; gap: 7px; }
        .ms-sub { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .ms-q { font-size: var(--fs-3); color: var(--color-ink-2); }
        .ms-acc { font-size: var(--fs-3); color: var(--color-ink-2); margin-bottom: 10px; }
        .ms-acc b { color: var(--color-ink); font-size: var(--fs-5); }
        .ms-n { color: var(--color-ink-3); font-weight: 500; margin-left: 4px; font-size: var(--fs-1); }
        .ms-row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-top: 1px solid var(--color-line); font-size: var(--fs-2); }
        .ms-k { color: var(--color-ink); max-width: 60%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ms-p { font-weight: 800; color: var(--color-ink); white-space: nowrap; }
        .ms-hold { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        .ms-link { margin-top: 12px; width: 100%; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 10px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .ms-foot { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.55; word-break: keep-all; margin: 0 2px; }
        .ms-funnel { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 4px 2px; }
        .ms-fstep { display: inline-flex; align-items: baseline; gap: 4px; }
        .ms-fstep b { font-size: var(--fs-5); font-weight: 800; color: var(--color-ink); }
        .ms-fstep i { font-size: var(--fs-1); font-style: normal; color: var(--color-ink-3); }
        .ms-farrow { color: var(--color-ink-3); margin: 0 4px; }
        .ms-fdrop { margin-top: 10px; font-size: var(--fs-2); color: var(--color-ink-2); word-break: keep-all; }
        .ms-fdrop b { color: var(--color-danger, #dc2626); }
        .ms-fsync { margin-top: 8px; font-size: var(--fs-1); color: var(--color-ink-3); }
        .ms-fpub { margin-top: 8px; font-size: var(--fs-2); color: var(--color-ink-2); }
        .ms-fpub b { color: var(--color-ink); font-weight: 800; }
      `}</style>
    </section>
  );
}
