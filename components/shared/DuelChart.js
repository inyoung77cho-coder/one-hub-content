// [S29-2] 대결 차트 — recharts 를 여기로 격리해 next/dynamic(ssr:false) 로만 로드한다.
//   → 대결 카드를 실제로 여는 사람만 recharts 를 내려받는다(AI 페이지 초기 번들에서 제외).
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer } from "recharts";

export default function DuelChart({ chartData, formatY }) {
  return (
    <ResponsiveContainer width="100%" height={160}>
      <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
        <XAxis dataKey="label" stroke="var(--color-ink-3)" fontSize={10} tickLine={false} />
        <YAxis domain={["dataMin", "dataMax"]} tickFormatter={formatY} stroke="var(--color-ink-3)" fontSize={10} tickLine={false} width={52} />
        <Line type="monotone" dataKey="나" stroke="var(--color-success)" strokeWidth={2} dot={{ r: 2 }} />
        <Line type="monotone" dataKey="AI" stroke="var(--purple, #8b5cf6)" strokeWidth={2} dot={{ r: 2 }} />
      </LineChart>
    </ResponsiveContainer>
  );
}
