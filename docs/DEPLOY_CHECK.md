# 배포 검증 절차 (매 푸시 후) — V1

> **커밋 ≠ 배포.** "안 보인다"의 상당수가 배포 지연 또는 Service Worker 캐시 때문이다.

## 1. 배포 확인
1. Vercel 대시보드 → 해당 커밋 Deployment = **Ready** (보통 1~3분)
2. Build Log 에 error/경고 0
3. `buildCommand`는 `npm run build`(= `next build --webpack`) — Turbopack 프로덕션 빌드 금지(하이드레이션 실패)

## 2. 실기기 확인 (데스크톱 반응형 모드 ≠ 실기기)
- 모바일 실기기에서 해당 화면을 직접 확인
- 추천 카드 등 모바일 레이아웃은 실기기에서만 정확히 검증됨

## 3. Ready인데 화면이 그대로면 = Service Worker 캐시
`public/sw.js`가 바뀐 상태(H3 딥링크·SW_VERSION)라 구버전 SW가 캐시를 물고 있을 수 있음.
1. 하드 리프레시 (모바일: 앱 완전 종료 후 재실행)
2. Chrome DevTools → Application → Service Workers → **Update** 또는 **Unregister**
3. 그래도면 Vercel → Redeploy (**Use existing Build Cache 해제**)

## 4. 지금 보는 게 최신인지 확인
설정 → 도움말 하단의 **빌드 스탬프**(`SW_VERSION`)를 확인.
검토 요청 시 이 값을 알려주면 최신 반영 여부를 판정할 수 있음.

## 5. 백엔드(auto_trade/엔진) 배포는 별개
- `auto_trade`·엔진은 **SCP 전용**(GitHub 미사용) · `.bak` 백업 필수 · 3서비스 동시 재시작
- 접속: `ssh -i C:\onehub\one-hub-key.pem ubuntu@54.180.54.132` (실경로·키는 `docs/SERVER_COORDS.md`)
