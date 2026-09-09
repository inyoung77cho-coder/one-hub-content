// [S33-1] 백엔드 생존을 PWA 부팅 시 1회 확인하고 전역으로 공유한다.
//   화면마다 /api/health 를 따로 부르지 않는다 — _app.js 가 Provider 로 감싸고,
//   각 화면은 useBackendHealth() 로 결과만 읽는다(S21-5 cachedJson dedup 정신).
//   ★문구 규칙: "오류/실패/에러" 금지 — 무엇이 안 되는지와 지금 보이는 게 무엇인지만.
import { createContext, useContext, useEffect, useState } from "react";
import { cachedJson } from "./quoteCache";

// 내부 이름 → 사용자 언어(상태 페이지·배너 공용)
export const SERVICE_KO = { engine: "주식 엔진", realestate: "부동산", etf: "ETF", news: "뉴스" };

const INIT = { ok: true, down: [], degraded: false, checkedAt: null, loading: true, reachable: true };
const Ctx = createContext(INIT);

export function BackendHealthProvider({ children }) {
  const [state, setState] = useState(INIT);
  useEffect(() => {
    let dead = false;
    // cachedJson 은 503(엔진 다운)도 본문(ok:false·services)을 그대로 준다. 완전 미도달만 null.
    cachedJson("/api/health")
      .then((d) => {
        if (dead) return;
        if (!d || !Array.isArray(d.services)) {
          // /api/health 자체에 못 닿음 → 알 수 없음. 거짓 경보를 만들지 않는다(배너 안 띄움).
          setState({ ...INIT, loading: false, reachable: false });
          return;
        }
        const down = d.services.filter((s) => !s.up).map((s) => s.name);
        setState({ ok: !!d.ok, down, degraded: !!d.degraded, checkedAt: d.ts || null, loading: false, reachable: true });
      })
      .catch(() => { if (!dead) setState({ ...INIT, loading: false, reachable: false }); });
    return () => { dead = true; };
  }, []);
  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

// → { ok, down: ["engine","realestate"], degraded, checkedAt, loading, reachable }
export function useBackendHealth() {
  return useContext(Ctx);
}
