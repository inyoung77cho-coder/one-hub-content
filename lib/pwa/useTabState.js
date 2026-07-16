// [S3/G2] 탭·필터 상태를 URL 쿼리로 유지(Pages Router 판). 뒤로가기·새로고침·딥링크가 상태를 잡는다.
//   탭/필터는 이 훅만 사용 — 페이지 내 useState로 탭 상태를 직접 들지 말 것.
//   탭 전환 = replace(히스토리 오염 방지, shallow=getServerSideProps 재실행 방지). 잘못된 값 → fallback 흡수(404 금지).
import { useRouter } from "next/router";
import { useCallback } from "react";

export function useTabState(key, allowed, fallback) {
  const router = useRouter();
  const raw = router.query[key];
  const value = allowed.includes(raw) ? raw : fallback;

  const set = useCallback(
    (next) => {
      const q = { ...router.query };
      if (next === fallback) delete q[key]; else q[key] = next; // 기본값은 URL 청소
      router.replace({ pathname: router.pathname, query: q }, undefined, { shallow: true, scroll: false });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [router, key, fallback]
  );

  return [value, set];
}
