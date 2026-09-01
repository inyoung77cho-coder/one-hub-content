// [S17-0 Part3 W3-3] 엔진 버전·계약 불일치 배너.
//
// 왜 이게 있는가:
//   auto_trade 는 GitHub 를 쓰지 않아 정본이 없다(F4). 잘못된 SCP 한 번이면 코드가 조용히
//   후퇴하고, 후퇴했다는 사실조차 아무도 모른다. 실제로 이번 사고는 사용자가
//   "텔레그램이 이상한데?" 하고 눈치로 알아낼 때까지 감지되지 않았다.
//   이 배너는 그 눈치를 기계로 대체한다.
//
// 규칙:
//   · 문제가 없으면 아무것도 그리지 않는다(정상일 때 조용해야 경고가 힘을 갖는다).
//   · 못 물어본 것(ok:false)과 다른 것(계약 불일치)을 구분해서 말한다.
//   · 숫자를 지어내지 않는다 — 모르면 모른다고 한다.
import { useEffect, useState } from "react";
import { cachedJson } from "../lib/quoteCache"; // [S21-5] /api/version 중복 GET dedup

// PWA 가 기대하는 엔진 API 계약. 엔진이 깨는 변경을 하면 양쪽을 함께 올린다.
export const EXPECTED_CONTRACT = "2026-07";

export default function EngineVersionBanner() {
  const [state, setState] = useState(null); // null=확인전 | {kind, msg}

  useEffect(() => {
    let dead = false;
    cachedJson("/api/version") // [S21-5] FeedbackButton 과 같은 URL → 중복 GET dedup
      .then((d) => {
        if (dead) return;
        if (!d?.ok) {
          setState({ kind: "unreachable", msg: "엔진 버전을 확인하지 못했습니다 — 일부 정보가 최신이 아닐 수 있습니다." });
          return;
        }
        if (d.api_contract !== EXPECTED_CONTRACT) {
          setState({
            kind: "mismatch",
            msg: `엔진 API 계약 불일치 (기대 ${EXPECTED_CONTRACT} / 실제 ${d.api_contract ?? "알 수 없음"}) — 일부 정보가 표시되지 않을 수 있습니다.`,
          });
          // eslint-disable-next-line no-console
          console.warn("[ONE-HUB] engine contract mismatch", { expected: EXPECTED_CONTRACT, actual: d.api_contract, version: d.app_version });
          return;
        }
        setState(null); // 정상 — 조용히 있는다
      })
      .catch(() => {
        if (!dead) setState({ kind: "unreachable", msg: "엔진 버전을 확인하지 못했습니다 — 일부 정보가 최신이 아닐 수 있습니다." });
      });
    return () => { dead = true; };
  }, []);

  if (!state) return null;

  return (
    <div className="evb" role="status">
      <span className="evb-i">⚠</span>
      <span className="evb-t">{state.msg}</span>
      <style jsx>{`
        .evb {
          display: flex; align-items: flex-start; gap: 8px;
          margin: 8px 16px 0; padding: 10px 12px;
          background: var(--color-card-soft); border: 1px solid var(--color-warning);
          border-radius: 10px; word-break: keep-all;
        }
        .evb-i { color: var(--color-warning); font-weight: 800; flex-shrink: 0; line-height: 1.5; }
        .evb-t { font-size: 0.74rem; line-height: 1.5; color: var(--color-ink-2); min-width: 0; }
      `}</style>
    </div>
  );
}
