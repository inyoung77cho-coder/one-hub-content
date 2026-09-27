// [2026-09-27] 첫 사용자 증권계좌 연결 가이드 — 3가지 방법을 한 곳에 쉽게.
//   ① KIS 자동 연동(주식 실시간) ② 증권사 화면 붙여넣기(ETF·연금) ③ 직접 입력(간단).
//   온보딩 완료 화면 + 전용 페이지(/pwa/connect)에서 재사용. CSS 변수 전용.
import { useRouter } from "next/router";

const METHODS = [
  {
    ic: "🔗", key: "kis", title: "증권사 자동 연동", tag: "주식 · 가장 편함",
    how: "한국투자증권 API 키를 한 번 등록하면 주식 잔고·시세가 매일 자동으로 최신화됩니다.",
    steps: ["한국투자증권 개발자센터에서 앱 키·시크릿 발급", "아래 버튼 → 키 붙여넣기 → 저장"],
    actions: [{ label: "API 키 등록", href: "/settings/api-key" }],
  },
  {
    ic: "📋", key: "paste", title: "증권사 화면 붙여넣기", tag: "ETF · 연금 · 미래에셋 등",
    how: "증권사 앱의 '자산현황' 화면을 그대로 복사해 붙여넣으면 보유 종목·평가액이 자동 인식됩니다. 로그인·키 연동이 필요 없습니다.",
    steps: ["증권사 앱 → 자산(잔고) 화면을 길게 눌러 전체 선택 → 복사", "아래 해당 버튼 → 붙여넣기 → 미리보기 확인 → 저장"],
    actions: [
      { label: "ETF 붙여넣기", href: "/pwa/etf" },
      { label: "연금 붙여넣기", href: "/pwa/pension" },
    ],
  },
  {
    ic: "✍️", key: "manual", title: "직접 입력", tag: "1분 · 금액만",
    how: "연동 없이 보유 금액만 간단히 입력해 바로 시작할 수 있습니다. 나중에 위 방법으로 정확히 연결해도 됩니다.",
    steps: ["종목명·수량·평단(또는 금액)만 입력", "주식·ETF·부동산·현금 순서대로"],
    actions: [{ label: "직접 입력 시작", href: "/pwa/onboarding" }],
  },
];

export default function ConnectAccountGuide({ compact = false, title = "증권계좌 연결하기" }) {
  const router = useRouter();
  return (
    <section className="cag">
      {!compact && <h2 className="cag-h">{title}</h2>}
      {!compact && <p className="cag-lead">내 자산을 불러오는 3가지 방법 — 편한 것부터 골라 시작하세요.</p>}
      <div className="cag-list">
        {METHODS.map((m) => (
          <div className="cag-card" key={m.key}>
            <div className="cag-top">
              <span className="cag-ic">{m.ic}</span>
              <span className="cag-t">{m.title}</span>
              <span className="cag-tag">{m.tag}</span>
            </div>
            <div className="cag-how">{m.how}</div>
            {!compact && (
              <ol className="cag-steps">
                {m.steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            )}
            <div className="cag-acts">
              {m.actions.map((a) => (
                <button key={a.href + a.label} className="cag-btn" onClick={() => router.push(a.href)}>{a.label} →</button>
              ))}
            </div>
          </div>
        ))}
      </div>
      <p className="cag-note">🔒 API 키·붙여넣은 화면은 내 자산 계산에만 쓰이며, 자동 주문 같은 거래 기능은 없습니다.</p>
      <style jsx>{`
        .cag { margin: 4px 0; }
        .cag-h { font-size: var(--fs-4); font-weight: 800; margin: 0 0 4px; color: var(--color-ink); }
        .cag-lead { font-size: var(--fs-2); color: var(--color-ink-3); margin: 0 0 12px; word-break: keep-all; }
        .cag-list { display: flex; flex-direction: column; gap: 10px; }
        .cag-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 14px; box-shadow: var(--shadow-card); }
        .cag-top { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .cag-ic { font-size: 20px; }
        .cag-t { font-size: var(--fs-3); font-weight: 800; color: var(--color-ink); }
        .cag-tag { font-size: var(--fs-1); font-weight: 700; color: var(--color-primary); background: var(--color-primary-soft, var(--color-card-soft)); border-radius: 999px; padding: 2px 8px; margin-left: auto; }
        .cag-how { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.55; margin-top: 8px; word-break: keep-all; }
        .cag-steps { margin: 8px 0 0; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; }
        .cag-steps li { font-size: var(--fs-1); color: var(--color-ink-3); line-height: 1.5; word-break: keep-all; }
        .cag-acts { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
        .cag-btn { flex: 1; min-width: 120px; background: var(--color-primary); color: var(--color-on-primary); border: none; border-radius: var(--radius-sm); padding: 10px 12px; font-size: var(--fs-2); font-weight: 800; font-family: var(--font-sans); cursor: pointer; }
        .cag-note { font-size: var(--fs-1); color: var(--color-ink-3); margin: 12px 0 0; line-height: 1.5; word-break: keep-all; }
      `}</style>
    </section>
  );
}
