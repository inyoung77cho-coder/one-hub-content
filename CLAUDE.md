# CLAUDE.md — ONE-HUB (one-hub-content)

ONE-HUB는 주식·ETF·부동산을 AI로 함께 운영하는 통합 자산관리 **PWA**다.
이 저장소(`one-hub-content`)는 **프론트엔드(Next.js on Vercel) + Vercel API 프록시**다.
실제 데이터·연산은 **Lightsail 서버의 백엔드 엔진들**(별도 저장소/서버 파일)이 담당한다.

## ⚠️ 절대 규칙 (어기면 프로덕션 전멸)

1. **빌드는 반드시 webpack.** `package.json`의 `"build": "next build --webpack"`을 절대 지우지 마라.
   Next 16의 Turbopack 프로덕션 빌드는 이 앱에서 하이드레이션이 깨져 **PWA 전체가 클릭·입력 무반응**이 된다.
   `next dev`(로컬)는 정상처럼 보여도 프로덕션이 죽는다. React는 18.3.1 유지(원인은 빌드툴).
2. **데이터 격리는 `trader`(A/B/u+kakaoId) 기준**이다. 모든 계정 데이터 API는 `WHERE trader=`로 스코프한다.
   `middleware.js`가 세션에서 trader를 강제 주입(`x-oh-tenant`)하고 클라가 보낸 trader를 덮어쓴다. 이 단일 강제 지점을 우회하지 마라.
3. **실서비스가 매일 돈다**(auto_trade 매매봇 등). 백엔드 수정은 백업 → 문법검사 → 재시작 → 회귀 확인 순서로.

## 아키텍처

```
[Vercel]  one-hub-content: PWA 프론트 + /pages/api 프록시 + 카카오 로그인(oh_session)
   │  fetch /api/*  (프록시가 RE_ACCESS_KEY/PWA_API_KEY 부착)
   ▼
[Lightsail 54.180.54.132]  SQLite only (Postgres 없음)
   onehub / onehub-b       매매봇 A/B (Flask, auto_trade)   · trading.db
   onehub-api      :5001   engine_status_api (Flask)        · trading.db
   onehub-realestate :5002 부동산 FastAPI (main.py)          · apartment.db · accounts.db · gathered.db
   onehub-etf      :5003   ETF Flask                         · etf.db
   ca-bot                  텔레그램 CA 봇(수집정보 파이프라인)
```
- SSH: `ssh -i C:\onehub\one-hub-key.pem ubuntu@54.180.54.132` (키는 `one-hub-key.pem` — 다른 .pem 아님)
- :5002는 `RE_ACCESS_KEY` 게이트(127.0.0.1 예외). Vercel 프록시가 `?key=`/`X-API-Key`로 통과.
- :5002 FastAPI에 라우터 추가 패턴: `from X import router; app.include_router(router)` (예: `account_api`, `ca_board_endpoints`).

## 데이터 저장

- **사용자 데이터는 브라우저 localStorage가 1차**(`onehub_*` 키). `lib/`의 여러 모듈이 관리(assetHistory, etfHoldings, stockHoldings, gameWallet, verdictLedger, ledger …).
- **기기 간 동기화**: `lib/syncManager.js`의 `SYNC_KEYS`를 `/api/user/state` → :5002 `/api/v2/user-state`(accounts.db `user_state` 테이블, trader PK)로 pull/push. 새 데이터를 동기화하려면 `SYNC_KEYS`에 키만 추가하면 된다(백엔드는 payload 통째 저장).
- 단일 원장: 총자산은 `lib/ledger.js` `getLedger` 하나만 진실. 소비자는 `breakdown`만 읽고 자체 합산 금지(ETF 이중계상 사고 이력).

## 인증 (카카오 OAuth)

- `pages/api/auth/kakao/*`(start/callback/logout) + `lib/auth.js`(jose JWT `oh_session` 쿠키 30일) + `lib/tenant.js`.
- 세션 클레임: `sub='kakao:{id}'`(tenant/admin 판정용, NI-4), `uid=`(정식 회원 id, accounts.db).
- **정식 회원/구독/동의/티어**는 `real_estate/api/account_api.py`(accounts.db): users/oauth_accounts/subscriptions/user_consents/user_state.
  콜백이 로그인 시 `/api/account/upsert` 호출 → 세션 uid. `/me`가 구독·권한 병합. `middleware`가 uid를 `x-oh-user`로 주입.
- 티어 게이팅 서버 로직은 준비됨(`require_tier`/PLAN_ENTITLEMENTS/watchlist 403). **활성화는 유료화 시점**(현재 전원 beta 무료).

## 명령

```bash
npm run dev          # 로컬 개발 (Turbopack — 하이드레이션 안 붙을 수 있음, 검증엔 부적합)
npm run dev -- --webpack --port 3001   # ★프론트 UI 검증은 이걸로(프로덕션과 동일 엔진)
npm run build        # 프로덕션 빌드(webpack). 배포 전 항상 통과 확인
```
- 배포는 `git push origin main` → Vercel 자동 배포. 커밋만 하면 Vercel이 빌드.
- 백엔드(Lightsail)는 파일 scp → `sudo systemctl restart <서비스>` (git 아님).

## ⚠️ 검증의 한계 (반드시 지킬 것)

- **PWA는 카카오 로그인 게이트 뒤라 Claude가 실화면을 직접 못 본다.** 빌드 통과·로직 유닛검증·백엔드 API 응답·같은 데이터의 공개 페이지(board) 렌더로 갈음하고, **최종 렌더는 사용자에게 확인 요청**한다. 추측으로 UI를 여러 번 고치지 말 것.
- **배포 착륙을 확인한 뒤 측정**한다. `git push` 직후 즉시 프로덕션을 재면 옛 빌드가 잡힌다. ISR 페이지는 `revalidate` 지연 있음.
- `grep`으로 코드에 있다 ≠ 화면에 보인다. 렌더 조건·픽셀·하이드레이션을 실제로 확인.
- Windows 로컬에서 프로덕션 HTTPS는 `curl --ssl-no-revoke` 필요(폐기검사 실패 회피).

## 디렉토리

```
pages/pwa/       PWA 화면(index=대시보드 4300줄, assets, etf, realestate, today, settings …)
pages/api/       Vercel 프록시(대부분 Lightsail 엔진으로 전달) + auth + me
pages/board/     공개 마케팅 보드(realestate=getStaticProps 정적+ISR)
pages/legal는 없음 — 약관은 /terms /privacy /disclaimer
components/      공유 UI(AppHeader, BottomNav, AssetSummaryBar(미사용), ReportTeaser …)
lib/             데이터·세션·동기화 로직(localStorage 1차)
content/daily/   일간 리포트 md(getStaticProps로 archive 노출, GitHub Actions가 생성)
```

## 저장소 함정 모음

- **커밋 메시지 heredoc**: Git Bash(POSIX)를 쓴다. PowerShell식 `@'…'@`를 붙이면 메시지에 `@`가 섞인다. `git commit -F -` + `<<'MSG'` 사용.
- **push 충돌**: GitHub Actions(sitemap·일간리포트)가 main에 커밋한다. push 실패 시 `git pull --rebase` 후 재시도.
- **관심목록·웹푸시는 이미 서버**(watchlist→:5001, push_subscriptions→trading.db). 새로 만들지 말고 재사용.
- `/api/pwa-*` 프리픽스는 middleware가 로그인 게이트로 보호(세션 필요). 공개로 두려면 목록 밖에.
- 상세 배경·의사결정 이력은 Claude의 auto-memory(`MEMORY.md` 인덱스)에 방대하게 있음 — 새 작업 전 관련 메모리 확인.
