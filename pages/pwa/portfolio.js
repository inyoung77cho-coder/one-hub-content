// [2026-08-10] 레거시 리다이렉트 — 이 페이지는 예전에 주식/ETF/부동산 API를 직접 재호출해 총자산을
//   자체 합산했다. lib/ledger.js(getLedger)가 유일한 원장이라는 원칙(assets.js 헤더 주석 참고, ETF
//   이중계상 사고 이력 있음)을 어기고 있어, 별도 합산 로직 없이 /pwa/assets로 리다이렉트만 한다.
//   URL 북마크·과거 링크가 죽지 않도록 라우트 자체는 남겨둔다.
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Portfolio() {
  const router = useRouter();
  useEffect(() => { router.replace("/pwa/assets"); }, [router]);
  return null;
}
