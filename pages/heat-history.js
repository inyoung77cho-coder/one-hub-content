// pages/heat-history.js
import Head from 'next/head';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

const GRADE_COLORS = {
  HOT: '#ff4d4f',
  WARM: '#faad14',
  COOL: '#1890ff',
  COLD: '#597ef7',
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
        const list = Array.isArray(data) ? data : data.history || [];
        setHistory(list);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [trader]);

  const chartData = [...history]
    .slice()
    .reverse()
    .map((item) => ({
      ...item,
      label: formatChartTime(item.date),
    }));

  const current = history[0];

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e0e0e8' }}>
      <Head>
        <title>Heat Score History | ONE-HUB</title>
      </Head>

      <main style={{ maxWidth: 900, margin: '0 auto', padding: '24px 16px' }}>
        <div style={{ marginBottom: 12 }}>
          <Link href="/dashboard" style={{ color: '#39ff88', fontSize: 13, textDecoration: 'none' }}>
            ← Dashboard
          </Link>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>📈 Heat Score History</h1>

          <div style={{ display: 'flex', gap: 8 }}>
            {['A', 'B'].map((t) => (
              <button
                key={t}
                onClick={() => setTrader(t)}
                style={{
                  padding: '6px 16px',
                  borderRadius: 8,
                  border: '1px solid #2a2a35',
                  background: trader === t ? '#39ff88' : 'transparent',
                  color: trader === t ? '#0a0a0f' : '#e0e0e8',
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
          <div style={{ padding: 16, background: '#2a1a1a', borderRadius: 8, marginBottom: 16, color: '#ff8080' }}>
            데이터를 불러오지 못했습니다: {error}
          </div>
        )}

        {loading && <div style={{ padding: 32, textAlign: 'center', color: '#888' }}>불러오는 중...</div>}

        {!loading && !error && current && (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
              gap: 12,
              marginBottom: 24,
            }}
          >
            <StatCard label="현재 점수" value={current.heat_score} color="#39ff88" />
            <StatCard
              label="등급"
              value={current.heat_grade}
              color={GRADE_COLORS[current.heat_grade] || '#e0e0e8'}
            />
            <StatCard label="시장 상태" value={REGIME_LABELS[current.regime] || current.regime} />
            <StatCard label="갱신 시각" value={formatTime(current.date)} small />
          </div>
        )}

        {!loading && !error && chartData.length > 0 && (
          <div
            style={{
              background: '#15151f',
              borderRadius: 12,
              padding: '16px 8px',
              marginBottom: 24,
              border: '1px solid #2a2a35',
            }}
          >
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2a2a35" />
                <XAxis dataKey="label" stroke="#888" fontSize={11} />
                <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
                <Tooltip
                  contentStyle={{ background: '#1f1f2b', border: '1px solid #2a2a35', borderRadius: 8 }}
                  labelStyle={{ color: '#e0e0e8' }}
                />
                <ReferenceLine y={70} stroke="#ff4d4f" strokeDasharray="4 4" label={{ value: 'HOT', position: 'right', fill: '#ff4d4f', fontSize: 11 }} />
                <ReferenceLine y={30} stroke="#597ef7" strokeDasharray="4 4" label={{ value: 'COLD', position: 'right', fill: '#597ef7', fontSize: 11 }} />
                <Line type="monotone" dataKey="heat_score" stroke="#39ff88" strokeWidth={2} dot={false} name="Heat Score" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {!loading && !error && (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2a2a35', textAlign: 'left' }}>
                  <th style={thStyle}>시각</th>
                  <th style={thStyle}>Heat</th>
                  <th style={thStyle}>등급</th>
                  <th style={thStyle}>Regime</th>
                  <th style={thStyle}>USD/KRW</th>
                  <th style={thStyle}>Nasdaq</th>
                  <th style={thStyle}>SOX</th>
                  <th style={thStyle}>VIX</th>
                  <th style={thStyle}>F&amp;G</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1f1f2b' }}>
                    <td style={tdStyle}>{formatTime(item.date)}</td>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>{item.heat_score}</td>
                    <td style={{ ...tdStyle, color: GRADE_COLORS[item.heat_grade] || '#e0e0e8' }}>
                      {item.heat_grade}
                    </td>
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
  const arrow = num > 0 ? '▲' : num < 0 ? '▼' : '➖';
  return `${arrow} ${Math.abs(num).toFixed(2)}%`;
}

function StatCard({ label, value, color, small }) {
  return (
    <div
      style={{
        background: '#15151f',
        border: '1px solid #2a2a35',
        borderRadius: 10,
        padding: '12px 14px',
      }}
    >
      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: small ? 13 : 20, fontWeight: 700, color: color || '#e0e0e8' }}>{value}</div>
    </div>
  );
}

const thStyle = { padding: '8px 10px', color: '#888', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle = { padding: '8px 10px', whiteSpace: 'nowrap' };
