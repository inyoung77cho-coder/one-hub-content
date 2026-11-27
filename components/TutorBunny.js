// [S49-4] 버니 선생님 캐릭터(시안용 임시) — 인라인 SVG. 원본 도형은 S49 지시서 부록 A.
//   props 계약: kind = "boy"(남자 버니·자신감) | "girl"(여자 버니·귀여움)
//              phase = "idle" | "speak"(입 움직임) | "listen"(양옆 음파) | "think"(말풍선 점)
//   정식 그림이 정해지면 이 파일 하나만 교체한다(계약 유지).
//
// 색: globals.css 토큰만 쓴다 — 배경 --hero-grad-1(남색), 강조 --hero-accent(민트), 얼굴 --color-on-primary(양 테마 흰색).
//   토큰이 없는 색은 이 컴포넌트 안 상수로만 둔다(globals.css 에 새 토큰 추가 금지).
//   ★눈·눈썹(#1E293B)은 --color-ink 와 같은 값이지만 다크 모드에서 --color-ink 가 밝은색으로 뒤집혀
//    흰 얼굴 위 눈이 사라지므로 토큰을 쓰지 않고 상수로 고정한다.
const C = {
  ink: "#1E293B",       // 눈·눈썹·입선 (테마 불변)
  earBoy: "#A9C2F0",    // 남자 버니 귀 안쪽 하늘색
  noseBoy: "#7C93BD",
  mintDark: "#5FD3A8",  // 넥타이 아래·리본 매듭
  pink: "#F7B8C4",      // 여자 버니 귀 안쪽·볼
  noseGirl: "#E8839A",
  mouthGirl: "#C2476A",
};
const FACE = { fill: "var(--color-on-primary)" };
const MINT = { fill: "var(--hero-accent)" };

export default function TutorBunny({ kind = "boy", phase = "idle", size = 210 }) {
  const speaking = phase === "speak";
  const label = kind === "girl" ? "여자 버니 선생님" : "남자 버니 선생님";
  return (
    <div className="bn-box" style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox="0 0 210 236" role="img" aria-label={label} className="bn-svg">
        {kind === "girl" ? (
          <g>
            <ellipse cx="72" cy="56" rx="19" ry="50" style={FACE} transform="rotate(-8 72 56)" />
            <ellipse cx="72" cy="60" rx="9" ry="34" fill={C.pink} transform="rotate(-8 72 60)" />
            <ellipse cx="150" cy="70" rx="19" ry="48" style={FACE} transform="rotate(34 150 70)" />
            <ellipse cx="151" cy="72" rx="9" ry="32" fill={C.pink} transform="rotate(34 151 72)" />
            <ellipse cx="105" cy="152" rx="79" ry="70" style={FACE} />
            {/* 리본 */}
            <path d="M66 96L44 84v24zM66 96l22-12v24z" style={MINT} />
            <circle cx="66" cy="96" r="6" fill={C.mintDark} />
            {/* 속눈썹 */}
            <path d="M63 133l-8-6M147 133l8-6" stroke={C.ink} strokeWidth="3" strokeLinecap="round" />
            <g className="bn-eye"><circle cx="76" cy="146" r="12" fill={C.ink} /><circle cx="80" cy="141" r="4.5" style={FACE} /></g>
            <g className="bn-eye"><circle cx="134" cy="146" r="12" fill={C.ink} /><circle cx="138" cy="141" r="4.5" style={FACE} /></g>
            <ellipse cx="50" cy="172" rx="13" ry="8" fill={C.pink} />
            <ellipse cx="160" cy="172" rx="13" ry="8" fill={C.pink} />
            <path d="M100 166h10l-5 6z" fill={C.noseGirl} />
            {speaking ? (
              <ellipse className="bn-mouth" cx="105" cy="188" rx="8" ry="9" fill={C.mouthGirl} />
            ) : (
              <path d="M94 180q5.5 8 11 0q5.5 8 11 0" fill="none" stroke={C.ink} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </g>
        ) : (
          <g>
            <ellipse cx="74" cy="54" rx="18" ry="52" style={FACE} transform="rotate(-5 74 54)" />
            <ellipse cx="74" cy="58" rx="8" ry="36" fill={C.earBoy} transform="rotate(-5 74 58)" />
            <ellipse cx="136" cy="54" rx="18" ry="52" style={FACE} transform="rotate(5 136 54)" />
            <ellipse cx="136" cy="58" rx="8" ry="36" fill={C.earBoy} transform="rotate(5 136 58)" />
            <rect x="29" y="86" width="152" height="130" rx="62" style={FACE} />
            <path d="M58 118L92 127M152 118L118 127" stroke={C.ink} strokeWidth="6" strokeLinecap="round" />
            <ellipse className="bn-eye" cx="78" cy="144" rx="7" ry="8" fill={C.ink} />
            <ellipse className="bn-eye" cx="132" cy="144" rx="7" ry="8" fill={C.ink} />
            <path d="M99 164h12l-6 7z" fill={C.noseBoy} />
            {speaking ? (
              <ellipse className="bn-mouth" cx="106" cy="188" rx="12" ry="10" fill={C.ink} />
            ) : (
              <path d="M88 183Q104 196 124 177" fill="none" stroke={C.ink} strokeWidth="4" strokeLinecap="round" />
            )}
            {/* 넥타이 */}
            <path d="M97 210h16l-4 9h-8z" style={MINT} />
            <path d="M101 219h8l5 17h-18z" fill={C.mintDark} />
          </g>
        )}

        {phase === "listen" && (
          <path className="bn-wave" d="M18 124q-11 28 0 56M192 124q11 28 0 56" fill="none" style={{ stroke: "var(--hero-accent)" }} strokeWidth="4" strokeLinecap="round" />
        )}
        {phase === "think" && (
          <g>
            <circle className="bn-dot" cx="176" cy="40" r="5" style={MINT} />
            <circle className="bn-dot d2" cx="190" cy="26" r="7" style={MINT} />
            <circle className="bn-dot d3" cx="198" cy="8" r="6" style={MINT} />
          </g>
        )}
      </svg>
      <style jsx>{`
        .bn-box { aspect-ratio: 210 / 236; background: var(--hero-grad-1); border-radius: var(--radius-hero); padding: 6%; box-sizing: border-box; }
        .bn-svg { display: block; width: 100%; height: 100%; overflow: visible; }
        .bn-eye, .bn-mouth, .bn-dot, .bn-wave { transform-box: fill-box; transform-origin: center; }
        .bn-eye { animation: bnBlink 4s infinite; }
        .bn-mouth { animation: bnMouth .32s ease-in-out infinite alternate; }
        .bn-dot { animation: bnFade 1.2s ease-in-out infinite; }
        .bn-dot.d2 { animation-delay: .2s; }
        .bn-dot.d3 { animation-delay: .4s; }
        .bn-wave { animation: bnFade .9s ease-in-out infinite; }
        @keyframes bnBlink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }
        @keyframes bnMouth { from { transform: scaleY(.25); } to { transform: scaleY(1); } }
        @keyframes bnFade { 0%, 100% { opacity: .25; } 50% { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .bn-eye, .bn-mouth, .bn-dot, .bn-wave { animation: none; }
        }
      `}</style>
    </div>
  );
}
