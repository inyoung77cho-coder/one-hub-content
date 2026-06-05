export default function MarketScore({ score, heatGrade, regime }) {

  const s = parseInt(score) || 0

  const label = () => {

    if (s >= 75) return { text: '공격 가능', color: '#00AA55', bg: '#00AA5510', border: '#00AA5540' }

    if (s >= 55) return { text: '선별 매수', color: '#CC8800', bg: '#CC880010', border: '#CC880040' }

    if (s >= 40) return { text: '관망 권장', color: '#4A9FDD', bg: '#4A9FDD10', border: '#4A9FDD40' }

    return { text: '진입 자제', color: '#DD3333', bg: '#DD333310', border: '#DD333340' }

  }

  const { text, color, bg, border } = label()

  const circumference = 2 * Math.PI * 36

  const offset = circumference - (s / 100) * circumference

  return (

    <div className="ms-wrap">

      <div className="ms-header">

        <span className="ms-title">ONE-HUB SCORE</span>

        <span className="ms-badge" style={{ color, background: bg, borderColor: border }}>{text}</span>

      </div>

      <div className="ms-body">

        <div className="ms-gauge">

          <svg viewBox="0 0 80 80" width="80" height="80">

            <circle cx="40" cy="40" r="36" fill="none" stroke="#E0DDD4" strokeWidth="6" />

            <circle cx="40" cy="40" r="36" fill="none" stroke={color} strokeWidth="6"

              strokeDasharray={circumference} strokeDashoffset={offset}

              strokeLinecap="round" transform="rotate(-90 40 40)"

              style={{ transition: "stroke-dashoffset 0.8s ease" }} />

            <text x="40" y="36" textAnchor="middle" fontSize="16" fontWeight="700" fill="#1A1A1A" fontFamily="Space Mono, monospace">{s}</text>

            <text x="40" y="50" textAnchor="middle" fontSize="8" fill="#9A9690" fontFamily="Space Mono, monospace">/100</text>

          </svg>

        </div>

        <div className="ms-detail">

          <div className="ms-row"><span className="ms-lbl">Heat Grade</span><span className="ms-val">{heatGrade || "-"}</span></div>

          <div className="ms-row"><span className="ms-lbl">Regime</span><span className="ms-val">{regime || "-"}</span></div>

          <div className="ms-row"><span className="ms-lbl">판단</span><span className="ms-val" style={{ color, fontWeight: 600 }}>{text}</span></div>

        </div>

      </div>

      <style jsx>{`

        .ms-wrap{background:#FFFFFF;border:1px solid #E0DDD4;border-radius:12px;padding:1rem 1.2rem;}

        .ms-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:0.8rem;}

        .ms-title{font-family:Space Mono,monospace;font-size:10px;font-weight:700;letter-spacing:0.1em;color:#9A9690;}

        .ms-badge{font-size:11px;font-weight:600;padding:3px 10px;border-radius:20px;border:1px solid;}

        .ms-body{display:flex;align-items:center;gap:1.2rem;}

        .ms-gauge{flex-shrink:0;}

        .ms-detail{flex:1;display:flex;flex-direction:column;gap:8px;}

        .ms-row{display:flex;justify-content:space-between;align-items:center;}

        .ms-lbl{font-size:11px;color:#9A9690;}

        .ms-val{font-family:Space Mono,monospace;font-size:12px;color:#1A1A1A;}

      `}</style>

    </div>

  )

}