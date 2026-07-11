import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { dedupBy } from '../../lib/useDedup';

export default function AccuracyPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/pwa/accuracy?trader_id=A')
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const pct = data?.summary?.accuracy_pct;
  const pctColor = pct == null ? 'var(--color-ink-3)' : pct >= 70 ? 'var(--color-success)' : pct >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
  const pctLabel = pct == null ? '-' : pct >= 70 ? '우수' : pct >= 50 ? '보통' : '개선 필요';

  return (
    <div style={{ minHeight:'100vh', background:'var(--color-bg)', color:'var(--color-ink)',
                  fontFamily:'Pretendard, sans-serif', paddingBottom:80 }}>

      {/* 헤더 */}
      <div style={{ background:'var(--color-card)', padding:'16px 20px',
                    display:'flex', alignItems:'center', gap:12,
                    borderBottom:'1px solid var(--color-line)', position:'sticky', top:0, zIndex:10 }}>
        <button onClick={() => router.back()}
                style={{ background:'none', border:'none', fontSize:20,
                         cursor:'pointer', color:'var(--color-ink)', lineHeight:1 }}>←</button>
        <span style={{ fontWeight:700, fontSize:17 }}>AI 차단 정확도</span>
      </div>

      <div style={{ padding:'20px 16px', maxWidth:480, margin:'0 auto' }}>

        {loading && (
          <div style={{ textAlign:'center', padding:60, color:'var(--color-ink-2)', fontSize:14 }}>
            불러오는 중...
          </div>
        )}

        {!loading && data?.ok && (() => {
          const s = data.summary;
          return (
            <>
              {/* 정확도 요약 카드 */}
              <div style={{ background:'var(--color-card)', borderRadius:16, padding:24,
                            marginBottom:16, textAlign:'center',
                            boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize:13, color:'var(--color-ink-2)', marginBottom:4 }}>
                  AI 차단 적중률
                </div>
                <div style={{ fontSize:64, fontWeight:800, color: pctColor, lineHeight:1.1 }}>
                  {pct != null ? `${pct}%` : '-'}
                </div>
                <div style={{ fontSize:12, color: pctColor, fontWeight:600, marginTop:4 }}>
                  {pctLabel}
                </div>
                <div style={{ fontSize:12, color:'var(--color-ink-2)', marginTop:8 }}>
                  검증 완료 {s.total_checked}건 중 {s.success_count}건 적중
                </div>

                {/* 수평 프로그레스바 */}
                <div style={{ margin:'16px 0 4px', height:8, background:'var(--color-bg)',
                              borderRadius:4, overflow:'hidden' }}>
                  <div style={{ height:'100%', width:`${pct || 0}%`,
                                background: pctColor, borderRadius:4,
                                transition:'width 0.8s ease' }} />
                </div>

                {/* 3개 통계 */}
                <div style={{ display:'flex', justifyContent:'space-around', marginTop:16 }}>
                  {[
                    { label:'총 차단', value: s.total_blocked, color:'var(--color-ink)' },
                    { label:'✓ 적중', value: s.success_count, color:'var(--color-success)' },
                    { label:'✗ 오판', value: s.fail_count,    color:'var(--color-danger)' },
                  ].map(stat => (
                    <div key={stat.label} style={{ textAlign:'center' }}>
                      <div style={{ fontWeight:800, fontSize:22, color: stat.color }}>
                        {stat.value}
                      </div>
                      <div style={{ fontSize:11, color:'var(--color-ink-2)', marginTop:2 }}>
                        {stat.label}
                      </div>
                    </div>
                  ))}
                </div>

                {/* [S7.6] 회피손실 합계 — 적중률만의 오해 방지(차단 적중이 실제로 막은 손실) */}
                {(() => {
                  const recent = data.recent || [];
                  const hits = recent.filter((r) => r.price_change_pct != null && r.price_change_pct < 0);
                  const avoidedPct = s.avoided_loss_pct != null ? s.avoided_loss_pct
                    : (hits.length ? hits.reduce((a, r) => a + Math.abs(r.price_change_pct), 0) : null);
                  const est = s.avoided_loss_pct == null;
                  if (avoidedPct == null) return null;
                  return (
                    <div style={{ marginTop:16, paddingTop:14, borderTop:'1px solid var(--color-line)',
                                  fontSize:12.5, color:'var(--color-ink-2)', lineHeight:1.55, textAlign:'left' }}>
                      🛡️ 차단 적중 <b style={{ color:'var(--color-ink)' }}>{s.success_count}건</b>으로 약{' '}
                      <b style={{ color:'var(--color-primary)' }}>-{Number(avoidedPct).toFixed(1)}%</b> 손실을 회피했습니다.
                      {est && <span style={{ fontSize:10.5, fontWeight:800, color:'var(--color-warning-ink)',
                        background:'var(--color-warning-soft)', padding:'1px 6px', borderRadius:5, marginLeft:6 }}>추정</span>}
                      <div style={{ fontSize:11, color:'var(--color-ink-3)', marginTop:4 }}>적중률뿐 아니라 <b>막아낸 손실 크기</b>로 차단의 실효를 봅니다{est ? ' (검증 하락분 합산 추정)' : ''}.</div>
                    </div>
                  );
                })()}
              </div>

              {/* [S7.6] 큰 오판 → 개선노트 링크 — 실패의 투명한 서사화 */}
              {(() => {
                const recent = data.recent || [];
                const bigMiss = recent.filter((r) => r.price_change_pct != null && r.price_change_pct > 0)
                  .sort((a, b) => b.price_change_pct - a.price_change_pct)[0];
                if (!bigMiss) return null;
                return (
                  <button onClick={() => router.push('/pwa?tab=report')} style={{ width:'100%', textAlign:'left',
                    background:'var(--color-danger-soft)', border:'1px solid var(--color-danger)', borderRadius:14,
                    padding:'13px 15px', marginBottom:16, cursor:'pointer', fontFamily:'var(--font-sans)' }}>
                    <div style={{ fontSize:13, fontWeight:800, color:'var(--color-danger)' }}>
                      🔧 큰 오판 · {bigMiss.stock} +{bigMiss.price_change_pct.toFixed(1)}%
                    </div>
                    <div style={{ fontSize:11.5, color:'var(--color-ink-2)', marginTop:4 }}>
                      차단 후 상승한 종목입니다. AI가 이 오판을 어떻게 보정 중인지 개선노트에서 확인 →
                    </div>
                  </button>
                );
              })()}

              {/* 사유별 정확도 */}
              <div style={{ background:'var(--color-card)', borderRadius:16, padding:20,
                            marginBottom:16, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>차단 사유별 적중률</div>
                {data.by_reason.map((r, i) => {
                  const p = r.accuracy_pct || 0;
                  const c = p >= 70 ? 'var(--color-success)' : p >= 50 ? 'var(--color-warning)' : 'var(--color-danger)';
                  return (
                    <div key={i} style={{ marginBottom: i < data.by_reason.length-1 ? 14 : 0 }}>
                      <div style={{ display:'flex', justifyContent:'space-between',
                                    fontSize:12, marginBottom:5, alignItems:'center' }}>
                        <span style={{ color:'var(--color-ink)', fontWeight:500,
                                       maxWidth:'65%', overflow:'hidden',
                                       textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {r.reason || '(미분류)'}
                        </span>
                        <span style={{ fontWeight:700, color: c, whiteSpace:'nowrap' }}>
                          {r.accuracy_pct != null ? `${r.accuracy_pct}%` : '-'}
                          <span style={{ color:'var(--color-ink-2)', fontWeight:400,
                                         marginLeft:4, fontSize:11 }}>
                            {r.success}/{r.total}건
                          </span>
                        </span>
                      </div>
                      <div style={{ height:6, background:'var(--color-bg)', borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${p}%`,
                                      background: c, borderRadius:3,
                                      transition:'width 0.6s ease' }} />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* 최근 차단 내역 */}
              <div style={{ background:'var(--color-card)', borderRadius:16, padding:20,
                            boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>
                  최근 차단 내역 (최근 20건)
                </div>
                {/* [S1.4] 종목코드+차단일 기준 공용 dedup(이중 방어) + 부호 단일 채점 */}
                {(() => {
                  const list = dedupBy(data.recent, (r) => `${r.code || r.stock}-${r.block_date || ""}`);
                  // 채점은 검증가-차단가 부호로 통일: 하락=적중 / 상승=오판 / 보합=보합
                  const verdict = (r) => {
                    if (r.price_change_pct == null) return "unchecked";
                    if (r.price_change_pct < 0) return "hit";
                    if (r.price_change_pct > 0) return "miss";
                    return "flat";
                  };
                  const V = { hit:  { t:"✓ 적중", bg:"var(--color-success-soft)", c:"var(--color-success-ink)" },
                              miss: { t:"✗ 오판", bg:"var(--color-danger-soft)",  c:"var(--color-danger)" },
                              flat: { t:"― 보합", bg:"var(--color-card-soft)",     c:"var(--color-ink-2)" },
                              unchecked: { t:"미검증", bg:"var(--color-bg)",       c:"var(--color-ink-2)" } };
                  return list.map((r, i) => { const v = V[verdict(r)]; return (
                  <div key={`${r.code || r.stock}-${r.block_date || i}`} style={{
                    padding:'12px 0',
                    borderBottom: i < list.length-1 ? '1px solid var(--color-line)' : 'none'
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                      <div>
                        <span style={{ fontWeight:700, fontSize:14 }}>{r.stock}</span>
                        <span style={{ fontSize:11, color:'var(--color-ink-2)', marginLeft:6 }}>
                          {r.code}
                        </span>
                      </div>
                      <span style={{
                        fontSize:11, fontWeight:700, padding:'2px 10px', borderRadius:20,
                        background: v.bg, color: v.c
                      }}>{v.t}</span>
                    </div>
                    <div style={{ fontSize:11, color:'var(--color-ink-2)', marginTop:3 }}>
                      {r.block_reason}
                    </div>
                    <div style={{ display:'flex', gap:12, marginTop:5, fontSize:12, flexWrap:'wrap' }}>
                      <span>차단가 <b>{r.block_price?.toLocaleString()}원</b></span>
                      {r.check_price && (
                        <span>검증가 <b>{r.check_price?.toLocaleString()}원</b></span>
                      )}
                      {r.price_change_pct != null && (
                        <span style={{
                          fontWeight:700,
                          color: r.price_change_pct < 0 ? 'var(--color-primary)' : r.price_change_pct > 0 ? 'var(--color-danger)' : 'var(--color-ink-2)'
                        }}>
                          {r.price_change_pct > 0 ? '+' : ''}{r.price_change_pct?.toFixed(2)}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize:10, color:'var(--color-ink-2)', marginTop:3 }}>
                      {r.block_date?.slice(0,10)} → {r.check_date || '미검증'}
                    </div>
                  </div>
                ); }); })()}
              </div>

              {/* 안내 문구 */}
              <div style={{ marginTop:16, padding:'12px 16px', background:'var(--color-card)',
                            borderRadius:12, fontSize:11, color:'var(--color-ink-2)',
                            lineHeight:1.6 }}>
                * 적중: AI가 차단한 종목이 이후 하락한 경우<br/>
                * 오판: AI가 차단했으나 이후 상승한 경우<br/>
                * 보합: 변동 0.00% (적중·오판 어느 쪽도 아님, 별도 집계)<br/>
                * 채점은 검증가−차단가 부호로 통일 · 매주 월요일 자동 검증(차단 후 3거래일 기준)
              </div>
            </>
          );
        })()}

        {!loading && (!data || !data.ok) && (
          <div style={{ background:'var(--color-card)', borderRadius:16, padding:'40px 24px',
                        textAlign:'center', boxShadow:'0 2px 12px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize:40, marginBottom:16 }}>🔄</div>
            <div style={{ fontSize:17, fontWeight:700, color:'var(--color-ink)', marginBottom:8 }}>
              데이터 수집 중
            </div>
            <div style={{ fontSize:13, color:'var(--color-ink-2)', lineHeight:1.7, marginBottom:16 }}>
              첫 통계는 <strong>5건 이상</strong> 거래 완료 후 표시됩니다.<br/>
              AI가 매일 종목을 차단하고 3거래일 후 검증합니다.
            </div>
            {data?.total_blocked != null && (
              <div style={{ display:'inline-block', padding:'8px 20px', borderRadius:20,
                            background:'var(--color-primary-soft)', color:'var(--color-primary)', fontSize:13, fontWeight:700 }}>
                현재 수집된 차단 기록: {data.total_blocked}건
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}