// pages/heat-history.js
import Head from 'next/head';
import Link from 'next/link';
import PageHero from '../components/PageHero';
import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
// [S29-2] recharts 동적 로드(ssr:false) — 초기 번들에서 제외. 로딩 중 같은 높이 자리표시자.
const HeatChart = dynamic(() => import('../components/shared/HeatChart'), { ssr: false, loading: () => <div style={{ height: 300 }} /> });

const GRADE_COLORS = {
  HOT: '#F04452',
  WARM: '#faad14',
  COOL: '#2F6BFF',
  COLD: '#2F6BFF',
};

const REGIME_LABELS = {
  BULL: '상승장',
  BEAR: '하락장',
  SIDEWAYS: '횡보장',
};

function formatTime(dateStr) {
  if (!dateStr) return '-';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatChartTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T'));
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit' });
}

export default function HeatHistory() {
  const [trader, setTrader] = useState('A');
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/pwa-heat-history?trader=${trader}&limit=50`)
      .then((res) => {
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.items || data.history || [];
        setHistory(list);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => { cancelled = true; };
  }, [trader]);

  const sortedHistory = [...history].sort((a, b) => (a.date < b.date ? 1 : -1));

  const chartData = [...history]
    .sort((a, b) => (a.date > b.date ? 1 : -1))
    .map((item) => ({
      ...item,
      label: formatChartTime(item.date),
    }));

  const current = history.length > 0
    ? history.reduce((latest, item) => (item.date > latest.date ? item : latest), history[0])
    : null;

  return (
    <div style={{ minHeight: '100vh', background: '#F4F9FF', color: '#1E293B' }}>
      <Head>
        <title>Heat Score History | ONE-HUB</title>
      </Head>

      <PageHero eyebrow="Heat History" title="🌡 히트 스코어 히스토리" subtitle="시장 과열도(Heat Score)의 시계열 추이를 추적합니다." />
      <main className="oh-main" style={{ maxWidth: 900 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', marginBottom: 20 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {['A', 'B'].map((t) => (
              <button
                key={t}
                onClick={() => setTrader(t)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 8,
                  border: '1px solid #E8EEF7',
                  background: trader === t ? '#16C784' : 'transparent',
                  color: trader === t ? '#F4F9FF' : '#1E293B',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Trader {t}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{ padding: 16, background: '#FDECEE', borderRadius: 8, marginBottom: 16, color: '#ff8080' }}>
            데이터를 불러오지 못했습니다: {error}
          </div>
        )}

        {loading && (
          <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중...</div>
        )}

        {!loading && !error && current && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12, marginBottom: 24 }}>
            <StatCard label="현재 점수" value={current.heat_score} color="#16C784" />
            <StatCard label="등급" value={current.heat_grade} color={GRADE_COLORS[current.heat_grade] || '#1E293B'} />
            <StatCard label="시장 상태" value={REGIME_LABELS[current.regime] || current.regime} />
            <StatCard label="마지막 업데이트" value={formatTime(current.date)} small />
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <div style={{ background: '#FFFFFF', borderRadius: 12, padding: '16px 8px', marginBottom: 24, border: '1px solid #E8EEF7' }}>
            <HeatChart chartData={chartData} />
          </div>
        )}

        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #E8EEF7', textAlign: 'left' }}>
                  <th style={thStyle}>시간</th>
                  <th style={thStyle}>Heat</th>
                  <th style={thStyle}>등급</th>
                  <th style={thStyle}>Regime</th>
                  <th style={thStyle}>USD/KRW</th>
                  <th style={thStyle}>Nasdaq</th>
                  <th style={thStyle}>SOX</th>
                  <th style={thStyle}>VIX</th>
                  <th style={thStyle}>F&G</th>
                </tr>
              </thead>
              <tbody>
                {sortedHistory.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #FFFFFF' }}>
                    <td style={tdStyle}>{formatTime(item.date)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{item.heat_score}</td>
                    <td style={{ ...tdStyle, color: GRADE_COLORS[item.heat_grade] || '#1E293B' }}>{item.heat_grade}</td>
                    <td style={tdStyle}>{REGIME_LABELS[item.regime] || item.regime}</td>
                    <td style={tdStyle}>{item.usdkrw}</td>
                    <td style={tdStyle}>{formatPct(item.nasdaq_chg)}</td>
                    <td style={tdStyle}>{formatPct(item.sox_chg)}</td>
                    <td style={tdStyle}>{item.vix}</td>
                    <td style={tdStyle}>{item.fear_greed}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {history.length === 0 && (
              <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>아직 데이터가 없습니다.</div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function formatPct(val) {
  if (val === null || val === undefined) return '-';
  const num = Number(val);
  const arrow = num > 0 ? '▲' : num < 0 ? '▼' : '−';
  return `${arrow} ${Math.abs(num).toFixed(2)}%`;
}

function StatCard({ label, value, color, small }) {
  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E8EEF7', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 20, fontWeight: 700, color: color || '#1E293B' }}>{value}</div>
    </div>
  );
}

const thStyle = { padding: '8px 10px', color: '#888', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 10px', whiteSpace: 'nowrap' };