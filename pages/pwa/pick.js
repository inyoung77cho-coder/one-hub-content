// [2026-08-27] 관망/샀어요 체크인 제거 — "오늘의 대결"과 무관한 별개 시스템
//   (verdictLedger/gameWallet, 3일 뒤 채점)이라 사용자 지시로 삭제. manifest.json의
//   start_url은 /pwa로 바뀌었지만, 설치된 PWA 아이콘/캐시가 이 경로를 계속 가리킬 수
//   있어 라우트 자체는 남기고 곧장 오늘의 대결로 보낸다.
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function PwaPickRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/pwa?tab=report&sec=vs");
  }, [router]);
  return null;
}
