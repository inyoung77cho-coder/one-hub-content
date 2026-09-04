import { useEffect, useState } from 'react';
import { dedupBy } from '../../lib/useDedup';
import ReportShell from '../../components/shared/ReportShell';
import { samplePolicy } from '../../lib/sampleSize';
import { aggregateByCategory } from '../../lib/ruleMap';
import EngineProposals from '../../components/EngineProposals';

export default function AccuracyPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pwa/accuracy?trader_id=A')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const pct = data?.summary?.accuracy_pct;
  const pctTone = pct == null ? 'na' : pct >= 70 ? 'good' : pct >= 50 ? 'warn' : 'bad';
  const pctLabel = pct == null ? '-' : pct >= 70 ? '우수' : pct >= 50 ? '보통' : '개선 필요';
  const barTone = (p) => (p >= 70 ? 'good' : p >= 50 ? 'warn' : 'bad');

  return (
    <ReportShell title="AI 차단 정확도" sub="AI가 매수를 차단한 종목이 이후 실제로 하락했는지 매주 검증합니다. 적중률과 막아낸 손실, 그리고 큰 오판의 개선 방향을 함께 봅니다.">
      {loading && <div className="ac-loading">불러오는 중…</div>}

      {!loading && data?.ok && (() => {
        const s = data.summary;
        const recent = data.recent || [];
        // [FB-8 3-C] 관계가 보이도록: 검증완료 = 적중 + 보합 + 오판, 대기 = 총차단 − 검증완료
        const flat = Math.max(0, (s.total_checked ?? 0) - (s.success_count ?? 0) - (s.fail_count ?? 0));
        const pending = Math.max(0, (s.total_blocked ?? 0) - (s.total_checked ?? 0));
        // 큰 오판(차단 후 상승 최대)
        const bigMiss = recent.filter((r) => r.price_change_pct != null && r.price_change_pct > 0)
          .sort((a, b) => b.price_change_pct - a.price_change_pct)[0];

        // [S28-3] 사유를 카테고리로 묶고, 표본 30건 이상에서만 판정한다. 2건으로 결론내지 않는다(노이즈 학습 방지).
        //   실제 개선 제안 생성은 서버 improve_proposer(하드 게이트 50건·백테스트)가 담당 — 여기선 정직한 상태만 보여준다.
        const cats = aggregateByCategory(data.by_reason);
        const improvements = [];
        const eligible = cats.filter((c) => !samplePolicy(c.scored).learning); // 30건 이상
        eligible.filter((c) => (c.accuracy_pct ?? 100) < 50)
          .sort((a, b) => (a.accuracy_pct ?? 0) - (b.accuracy_pct ?? 0))
          .slice(0, 2)
          .forEach((c) => improvements.push({
            icon: '🎯', title: `'${c.label}' 사유 재검토`,
            detail: `채점 ${c.scored}건 · 적중률 ${c.accuracy_pct}%. 표본이 충분하고 적중이 낮아, 이 사유의 차단 조건을 좁히는 것을 엔진 정비소(운영자) 검토 대상에 올립니다.`,
          }));
        if (!improvements.length) improvements.push({
          icon: '📊', title: '아직 제안할 규칙이 없습니다',
          detail: '표본 30건 이상인 차단 사유가 아직 없습니다. 2~3건으로 규칙을 바꾸면 노이즈를 학습합니다 — 표본이 쌓일 때까지 관찰만 합니다. 실제 개선 제안은 표본 기준을 통과할 때 엔진 정비소에서 생성됩니다.',
        });

        return (
          <>
            {/* 정확도 요약 카드 */}
            <section className="ac-card ac-hero">
              <div className="ac-hero-lbl">AI 차단 적중률</div>
              <div className={`ac-hero-pct ${pctTone}`}>{pct != null ? `${pct}%` : '-'}</div>
              <div className={`ac-hero-tag ${pctTone}`}>{pctLabel}</div>
              <div className="ac-hero-mean">AI가 “사지 말라”고 막은 종목 중, 3거래일 뒤 검증에서 <b>실제로 오르지 않은</b> 비율이에요.</div>
              <div className="ac-bar"><div className={`ac-bar-fill ${pctTone}`} style={{ width: `${pct || 0}%` }} /></div>
              <div className="ac-hero-sub">적중률 = 적중 {s.success_count} ÷ 검증 완료 {s.total_checked}</div>
              {/* [FB-8 3-C] 총차단 → 검증완료(대기) 관계를 눈에 보이게 */}
              <div className="ac-funnel">
                <span>총 차단 <b>{s.total_blocked}</b></span>
                <span className="ac-funnel-ar">→</span>
                <span>검증 완료 <b>{s.total_checked}</b></span>
                {pending > 0 && <span className="ac-funnel-wait">검증 대기 {pending}</span>}
              </div>
              <div className="ac-stats">
                {[
                  { label: '✓ 적중', value: s.success_count, tone: 'good' },
                  { label: '― 보합', value: flat, tone: '' },
                  { label: '✗ 오판', value: s.fail_count, tone: 'bad' },
                ].map((stat) => (
                  <div className="ac-stat" key={stat.label}>
                    <div className={`ac-stat-v ${stat.tone}`}>{stat.value}</div>
                    <div className="ac-stat-k">{stat.label}</div>
                  </div>
                ))}
              </div>
              <div className="ac-stats-note">검증 완료 {s.total_checked}건 = 적중 {s.success_count} + 보합 {flat} + 오판 {s.fail_count}</div>
              {/* [S7.6] 회피손실 합계 — 적중률만의 오해 방지 */}
              {(() => {
                const hits = recent.filter((r) => r.price_change_pct != null && r.price_change_pct < 0);
                const avoidedPct = s.avoided_loss_pct != null ? s.avoided_loss_pct
                  : (hits.length ? hits.reduce((a, r) => a + Math.abs(r.price_change_pct), 0) : null);
                const est = s.avoided_loss_pct == null;
                if (avoidedPct == null) return null;
                return (
                  <div className="ac-avoid">
                    🛡️ 차단 적중 <b>{s.success_count}건</b>으로 약 <b className="hl">-{Number(avoidedPct).toFixed(1)}%</b> 손실을 회피했습니다.
                    {est && <span className="ac-est">추정</span>}
                    <div className="ac-avoid-note">적중률뿐 아니라 <b>막아낸 손실 크기</b>로 차단의 실효를 봅니다{est ? ' (검증 하락분 합산 추정)' : ''}.</div>
                  </div>
                );
              })()}
            </section>

            {/* [FB-8 3-B] 무엇을 하면 정확도가 올라가나 — 쉬운 안내 */}
            <section className="ac-card ac-howto">
              <div className="ac-card-h">📈 정확도는 어떻게 올라가나요?</div>
              <ul className="ac-howto-list">
                <li>매주 검증이 쌓일수록 숫자가 정교해져요. (지금까지 검증 완료 {s.total_checked}건)</li>
                <li>오판이 잦은 신호는 거래량·수급 같은 보조지표를 더해 차단 기준을 좁혀요 — 아래 개선 제안 참고.</li>
              </ul>
            </section>

            {/* [A2] 큰 오판 개선 제안 */}
            <section className="ac-card ac-improve">
              <div className="ac-card-h">🔧 큰 오판 · 향후 개선 제안</div>
              <div className="ac-imp-list">
                {improvements.map((im, i) => (
                  <div className="ac-imp" key={i}>
                    <span className="ac-imp-ic">{im.icon}</span>
                    <div className="ac-imp-body">
                      <div className="ac-imp-t">{im.title}</div>
                      <div className="ac-imp-d">{im.detail}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ac-imp-foot">위는 '어느 규칙이 약해 보이나'(관측)입니다. 실제 조정 제안은 아래에서 표본·백테스트 기준을 통과할 때만 올라옵니다.</div>
            </section>

            {/* [S28-6] 승인 대기 제안(백테스트·근거·한계 포함) — 승인해도 서버는 안 바뀜(패치·명령만) */}
            <EngineProposals />

            {/* [S28-3] 차단 사유별 — 카테고리로 묶고, 표본 30건 미만은 '판정 보류'(정확도·색 안 붙임) */}
            <section className="ac-card">
              <div className="ac-card-h">차단 사유별 적중률 <span className="ac-card-sub">표본 30건+ 만 판정</span></div>
              {cats.map((c, i) => {
                const pol = samplePolicy(c.scored);
                if (pol.learning) {
                  return (
                    <div className="ac-reason" key={i}>
                      <div className="ac-reason-top">
                        <span className="ac-reason-k">{c.label}</span>
                        <span className="ac-reason-hold">판정 보류 · {c.scored}/30</span>
                      </div>
                      <div className="ac-bar sm"><div className="ac-bar-fill" style={{ width: `${pol.progressPct}%` }} /></div>
                    </div>
                  );
                }
                const p = c.accuracy_pct || 0;
                const t = barTone(p);
                return (
                  <div className="ac-reason" key={i}>
                    <div className="ac-reason-top">
                      <span className="ac-reason-k">{c.label}</span>
                      <span className={`ac-reason-p ${t}`}>{c.accuracy_pct != null ? `${c.accuracy_pct}%` : '-'}<span className="ac-reason-n">{c.hits}/{c.scored}건</span></span>
                    </div>
                    <div className="ac-bar sm"><div className={`ac-bar-fill ${t}`} style={{ width: `${p}%` }} /></div>
                  </div>
                );
              })}
              <div className="ac-imp-foot">사유는 자유 문자열을 카테고리로 묶은 것입니다. 이 사유들은 매수 점수의 가중치 규칙(RSI·거래량 등)과 1:1로 대응하지 않습니다 — 차단 판단 자체의 정확도입니다.</div>
            </section>

            {/* 최근 차단 내역 */}
            <section className="ac-card">
              <div className="ac-card-h">최근 차단 내역 <span className="ac-card-sub">최근 20건</span></div>
              {(() => {
                const list = dedupBy(data.recent, (r) => `${r.code || r.stock}-${r.block_date || ''}`);
                const verdict = (r) => {
                  if (r.price_change_pct == null) return 'unchecked';
                  if (r.price_change_pct < 0) return 'hit';
                  if (r.price_change_pct > 0) return 'miss';
                  return 'flat';
                };
                const V = {
                  hit: { t: '✓ 적중', cls: 'hit' }, miss: { t: '✗ 오판', cls: 'miss' },
                  flat: { t: '― 보합', cls: 'flat' }, unchecked: { t: '미검증', cls: 'flat' },
                };
                return list.map((r, i) => {
                  const v = V[verdict(r)];
                  return (
                    <div className={`ac-rec ${i < list.length - 1 ? 'div' : ''}`} key={`${r.code || r.stock}-${r.block_date || i}`}>
                      <div className="ac-rec-top">
                        <div><b className="ac-rec-name">{r.stock}</b><span className="ac-rec-code">{r.code}</span></div>
                        <span className={`ac-verdict ${v.cls}`}>{v.t}</span>
                      </div>
                      <div className="ac-rec-reason">{r.block_reason}</div>
                      <div className="ac-rec-prices">
                        <span>차단가 <b>{r.block_price?.toLocaleString()}원</b></span>
                        {r.check_price && <span>검증가 <b>{r.check_price?.toLocaleString()}원</b></span>}
                        {r.price_change_pct != null && (
                          <span className={`ac-rec-chg ${r.price_change_pct < 0 ? 'good' : r.price_change_pct > 0 ? 'bad' : ''}`}>
                            {r.price_change_pct > 0 ? '+' : ''}{r.price_change_pct?.toFixed(2)}%
                          </span>
                        )}
                      </div>
                      <div className="ac-rec-date">{r.block_date?.slice(0, 10)} → {r.check_date || '미검증'}</div>
                    </div>
                  );
                });
              })()}
            </section>

            {/* 안내 문구 */}
            <div className="ac-legend">
              * 적중: AI가 차단한 종목이 이후 하락한 경우<br />
              * 오판: AI가 차단했으나 이후 상승한 경우<br />
              * 보합: 변동 0.00% (적중·오판 어느 쪽도 아님, 별도 집계)<br />
              * 채점은 검증가−차단가 부호로 통일 · 매주 월요일 자동 검증(차단 후 3거래일 기준)
            </div>
          </>
        );
      })()}

      {!loading && (!data || !data.ok) && (
        <section className="ac-card ac-empty">
          <div className="ac-empty-ic">🔄</div>
          <div className="ac-empty-t">데이터 수집 중</div>
          <div className="ac-empty-d">첫 통계는 <b>5건 이상</b> 거래 완료 후 표시됩니다.<br />AI가 매일 종목을 차단하고 3거래일 후 검증합니다.</div>
          {data?.total_blocked != null && <div className="ac-empty-badge">현재 수집된 차단 기록: {data.total_blocked}건</div>}
        </section>
      )}

      <style jsx>{`
        .ac-loading { text-align: center; padding: 60px 0; color: var(--color-ink-2); font-size: var(--fs-4); }
        .ac-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card); box-shadow: var(--shadow-card); padding: 16px; margin-bottom: 12px; }
        .ac-card-h { font-weight: 800; font-size: var(--fs-4); color: var(--color-ink); margin-bottom: 13px; display: flex; align-items: baseline; gap: 7px; }
        .ac-card-sub { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); }
        /* 히어로 요약 */
        .ac-hero { text-align: center; }
        .ac-hero-lbl { font-size: var(--fs-3); color: var(--color-ink-2); margin-bottom: 4px; }
        .ac-hero-pct { font-size: 3.7rem; font-weight: 800; line-height: 1.05; font-variant-numeric: tabular-nums; }
        .ac-hero-tag { font-size: var(--fs-2); font-weight: 700; margin-top: 4px; }
        .ac-hero-sub { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 8px; }
        .ac-hero-mean { font-size: var(--fs-2); color: var(--color-ink-2); margin-top: 10px; line-height: 1.55; word-break: keep-all; }
        .ac-hero-mean b { color: var(--color-ink); font-weight: 800; }
        .ac-funnel { display: flex; align-items: center; justify-content: center; flex-wrap: wrap; gap: 8px; margin-top: 14px; font-size: var(--fs-2); color: var(--color-ink-2); }
        .ac-funnel b { color: var(--color-ink); font-weight: 800; }
        .ac-funnel-ar { color: var(--color-ink-3); }
        .ac-funnel-wait { font-size: var(--fs-1); color: var(--color-ink-3); background: var(--color-card-soft); padding: 2px 8px; border-radius: var(--radius-sm); }
        .ac-stats-note { font-size: var(--fs-1); color: var(--color-ink-3); text-align: center; margin-top: 9px; word-break: keep-all; }
        .ac-howto-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
        .ac-howto-list li { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.55; padding-left: 18px; position: relative; word-break: keep-all; }
        .ac-howto-list li::before { content: "→"; position: absolute; left: 0; color: var(--color-primary); font-weight: 800; }
        .good { color: var(--color-success); }
        .warn { color: var(--color-warning); }
        .bad { color: var(--color-danger); }
        .na { color: var(--color-ink-3); }
        .ac-bar { height: 8px; background: var(--color-bg); border-radius: var(--radius-sm); overflow: hidden; margin: 15px 0 4px; }
        .ac-bar.sm { height: 6px; margin: 0; }
        .ac-bar-fill { height: 100%; border-radius: var(--radius-sm); transition: width 0.7s ease; background: var(--color-ink-3); }
        .ac-bar-fill.good { background: var(--color-success); }
        .ac-bar-fill.warn { background: var(--color-warning); }
        .ac-bar-fill.bad { background: var(--color-danger); }
        .ac-stats { display: flex; justify-content: space-around; margin-top: 16px; }
        .ac-stat-v { font-weight: 800; font-size: var(--fs-7); color: var(--color-ink); }
        .ac-stat-k { font-size: var(--fs-1); color: var(--color-ink-2); margin-top: 2px; }
        .ac-avoid { margin-top: 16px; padding-top: 14px; border-top: 1px solid var(--color-line); font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; text-align: left; }
        .ac-avoid b { color: var(--color-ink); }
        .ac-avoid b.hl { color: var(--color-primary); }
        .ac-est { font-size: var(--fs-1); font-weight: 800; color: var(--color-warning-ink); background: var(--color-warning-soft); padding: 1px 6px; border-radius: var(--radius-sm); margin-left: 6px; }
        .ac-avoid-note { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 4px; }
        /* [A2] 개선 제안 */
        .ac-improve { border-left: 4px solid var(--color-danger); }
        .ac-imp-list { display: flex; flex-direction: column; gap: 9px; }
        .ac-imp { display: flex; gap: 10px; align-items: flex-start; background: var(--color-card-soft); border-radius: var(--radius-md); padding: 12px 13px; }
        .ac-imp-ic { font-size: var(--fs-5); line-height: 1.3; flex-shrink: 0; }
        .ac-imp-body { flex: 1; min-width: 0; }
        .ac-imp-t { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); }
        .ac-imp-d { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; margin-top: 3px; word-break: keep-all; }
        .ac-imp-foot { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 11px; line-height: 1.5; word-break: keep-all; }
        /* 사유별 */
        .ac-reason { margin-bottom: 13px; }
        .ac-reason:last-child { margin-bottom: 0; }
        .ac-reason-top { display: flex; justify-content: space-between; align-items: center; font-size: var(--fs-2); margin-bottom: 5px; }
        .ac-reason-k { color: var(--color-ink); font-weight: 500; max-width: 62%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .ac-reason-p { font-weight: 800; white-space: nowrap; }
        .ac-reason-n { color: var(--color-ink-2); font-weight: 500; margin-left: 4px; font-size: var(--fs-1); }
        .ac-reason-hold { font-size: var(--fs-1); font-weight: 700; color: var(--color-ink-3); white-space: nowrap; }
        /* 최근 내역 */
        .ac-rec { padding: 12px 0; }
        .ac-rec.div { border-bottom: 1px solid var(--color-line); }
        .ac-rec-top { display: flex; justify-content: space-between; align-items: flex-start; }
        .ac-rec-name { font-weight: 700; font-size: var(--fs-4); color: var(--color-ink); }
        .ac-rec-code { font-size: var(--fs-1); color: var(--color-ink-2); margin-left: 6px; }
        .ac-verdict { font-size: var(--fs-1); font-weight: 700; padding: 2px 10px; border-radius: var(--radius-card); white-space: nowrap; }
        .ac-verdict.hit { background: var(--color-success-soft); color: var(--color-success-ink); }
        .ac-verdict.miss { background: var(--color-danger-soft); color: var(--color-danger); }
        .ac-verdict.flat { background: var(--color-card-soft); color: var(--color-ink-2); }
        .ac-rec-reason { font-size: var(--fs-1); color: var(--color-ink-2); margin-top: 3px; }
        .ac-rec-prices { display: flex; gap: 12px; margin-top: 5px; font-size: var(--fs-2); flex-wrap: wrap; }
        .ac-rec-prices b { color: var(--color-ink); }
        .ac-rec-chg { font-weight: 700; }
        .ac-rec-chg.good { color: var(--color-primary); }
        .ac-rec-chg.bad { color: var(--color-danger); }
        .ac-rec-date { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 3px; }
        .ac-legend { margin-top: 4px; padding: 13px 16px; background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); font-size: var(--fs-1); color: var(--color-ink-2); line-height: 1.6; }
        /* 빈 상태 */
        .ac-empty { text-align: center; padding: 40px 24px; }
        .ac-empty-ic { font-size: 2.4rem; margin-bottom: 14px; }
        .ac-empty-t { font-size: var(--fs-5); font-weight: 700; color: var(--color-ink); margin-bottom: 8px; }
        .ac-empty-d { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.7; margin-bottom: 16px; }
        .ac-empty-badge { display: inline-block; padding: 8px 20px; border-radius: var(--radius-card); background: var(--color-primary-soft); color: var(--color-primary); font-size: var(--fs-3); font-weight: 700; }
      `}</style>
    </ReportShell>
  );
}
