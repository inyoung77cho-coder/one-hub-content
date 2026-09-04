// [S26-4] 공용 카드 — "껍데기만" 담당(배경·테두리·모서리·그림자·안쪽여백·아래간격).
//   styled-jsx 는 컴포넌트 스코프라 children 에 스타일이 안 넘어가므로, 껍데기는 인라인 토큰 스타일로.
//   내부 콘텐츠(제목·행·버튼)의 스타일은 각 페이지가 계속 자기 styled-jsx 로 가진다(:global 금지).
//   tone: default | accent(판단 카드 — 다섯 장 중 하나만 들어올림, S24-6) | warn(확인 필요·이상치)
//   pad : md(기본, --sp-4) | sm(--sp-3)
//   as  : 렌더 태그(기본 section)
export default function Card({ tone = "default", pad = "md", as: Tag = "section", className = "", style = {}, children, ...rest }) {
  const base = {
    background: "var(--color-card)",
    border: "1px solid var(--color-line)",
    borderRadius: "var(--radius-card)",
    boxShadow: "var(--shadow-card)",
    padding: pad === "sm" ? "var(--sp-3)" : "var(--sp-4)",
    marginBottom: "var(--sp-3)",
  };
  const tones = {
    default: {},
    accent: { border: "1.5px solid var(--color-primary)" },
    warn: { border: "1px solid var(--color-warning)", background: "var(--color-warning-soft)" },
  };
  return (
    <Tag className={`oh-card-sh${className ? " " + className : ""}`} style={{ ...base, ...(tones[tone] || {}), ...style }} {...rest}>
      {children}
    </Tag>
  );
}
