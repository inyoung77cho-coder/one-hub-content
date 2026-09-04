// [S29-2] 히트 히스토리 차트 — recharts 격리(next/dynamic ssr:false 로만 로드). 공개 페이지라 SEO 영향 없게.
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';

export default function HeatChart({ chartData }) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E8EEF7" />
        <XAxis dataKey="label" stroke="#888" fontSize={11} />
        <YAxis domain={[0, 100]} stroke="#888" fontSize={11} />
        <Tooltip contentStyle={{ background: '#FFFFFF', border: '1px solid #E8EEF7', borderRadius: 8 }} labelStyle={{ color: '#1E293B' }} />
        <ReferenceLine y={70} stroke="#F04452" strokeDasharray="4 4" label={{ value: 'HOT', position: 'right', fill: '#F04452', fontSize: 11 }} />
        <ReferenceLine y={30} stroke="#2F6BFF" strokeDasharray="4 4" label={{ value: 'COLD', position: 'right', fill: '#2F6BFF', fontSize: 11 }} />
        <Line type="monotone" dataKey="heat_score" stroke="#16C784" strokeWidth={2} dot={false} name="Heat Score" />
      </LineChart>
    </ResponsiveContainer>
  );
}
