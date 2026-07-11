// [S1.4] 공용 dedup 훅 — 추천·차단·히트 히스토리·홀딩스·부동산 등 모든 리스트 렌더 직전에 적용.
//   백엔드가 GROUP BY로 1차 방어하더라도, 프론트에서 2차 방어(이중 방어)로 중복 카드 렌더를 원천 차단.
//   키 규칙(워크오더): 주식=종목코드(code), 단지=단지ID(complexId). keyFn으로 리스트별 키를 주입한다.
import { useMemo } from "react";

// 순수 함수판 — 렌더 외부(정렬 전처리 등)에서도 재사용.
export function dedupBy(list, keyFn) {
  if (!Array.isArray(list)) return [];
  const seen = new Map();
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    let key;
    try {
      key = keyFn(item, i);
    } catch {
      key = undefined;
    }
    // 키를 못 만들면 인덱스로 폴백 — 절대 유실되지 않도록.
    if (key == null || key === "") key = `__idx_${i}`;
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.values()];
}

// React 훅판 — 리스트/키함수 변경 시에만 재계산.
export default function useDedup(list, keyFn) {
  return useMemo(() => dedupBy(list, keyFn), [list, keyFn]);
}
