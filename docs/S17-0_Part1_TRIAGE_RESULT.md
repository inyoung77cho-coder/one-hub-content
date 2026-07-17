# S17-0 트리아지 판정서

작성 2026-07-17 · 서버 `ip-172-26-3-68`(54.180.54.132) · **코드 수정 0건(관측만)**

---

## 판정

- **판정: 【B】 못 사는 것**
- **확정 가설: H-신규** — 지시서 가설표에 없던 원인. **승인→집행 체인 단절**
- **기각 가설: H-A(디스크) · H-B(롤백) · H-C(토큰/서킷) · H-D(타임존) · H-E(주말플래그) · H-F(방향성 예외 소실)** — **6개 전부 기각**

### ★ 지시서 판정 트리는 【A】로 떨어집니다 — 그리고 그 결과는 틀렸습니다

W1-7 판정 트리를 그대로 타면:

```
DB 쓰기 실패?            → NO
토큰/잔고조회 실패?       → NO
STOCK_POOL<92 / 예외 부재? → NO (182종목 · 예외 생존)
_should_block_weekend True? → NO
                          → 【A】 엔진 정상. AI가 판단상 매수 안 함.
```

**그러나 【A】는 사실이 아닙니다.** `pending_signals`가 **AI는 사자고 했음**을 증명합니다:

| 일자 | 종목 | 신호 | final_score | 국면 | 결말 |
|---|---|---|---|---|---|
| 07-15 | HMM | BUY | **72.6** | SIDEWAYS | **expired** |
| 07-10 | 솔브레인홀딩스 | **STRONG_BUY** | 62.5 | **BULL** | **expired** |
| 07-10 | (7건) | BUY | **80.5** | — | rejected |
| 06-30 | (11건) | BUY | 79.3 | — | expired |

BEAR라서 안 산 게 아닙니다. **SIDEWAYS·BULL 국면에서 72~80점 신호가 나왔고 전부 만료·거절됐습니다.**

**트리에 "신호는 났는데 집행에 도달하지 못함" 분기가 없습니다.** A(판단상 안 삼)와 B(주문 API 실패)만 있고, 그 사이의 **승인 대기 구간**이 빠져 있습니다. 트리 결과(A)를 그대로 채택하면 "엔진 정상, AI 판단"으로 종결되어 **진짜 원인을 영영 못 찾습니다.**

---

## 실측값

| 항목 | 실측 | 지시서 기대 | 판정 |
|---|---|---|---|
| APP_VERSION | **v10.0.0-ops** (`version.py`, 7/7 13:55) | v8.2 | ❌ 전제 오류 |
| STOCK_POOL 종목 수 | **182** | 92 | ❌ 전제 오류(실제가 더 많음) |
| `get_stock_regime` 존재 | **Y** (`stock_screener.py:418`) | Y | ✅ |
| 방향성 예외 분기 존재 | **Y** (`stock_screener.py:420~435` hedge/inverse/defense/defensive) | Y | ✅ |
| `_direction` 주입 | **Y** (`stock_screener.py:515~523`) | — | ✅ 죽은 코드 아님 |
| `_should_block_weekend` | **정상 요일 판정**(토/일 시간대 세분화). 하드코딩 `True` 아님 | — | ✅ H-E 기각 |
| 디스크 여유 | **49G (17% 사용)** | 560M(92%) | ❌ 다른 서버(3.36) |
| inode | **3%** | — | ✅ |
| DB 쓰기 | **OK** (`integrity_check`=ok, `-wal`/`-journal` 잔존 없음) | — | ✅ H-A 기각 |
| 서킷브레이커 | `kis_api.py:48` **v9.1 [ENG-01]** 구현 존재(임계 5회·쿨다운 900s). **최근 3일 발동 로그 0건** | — | ✅ H-C 기각 |
| 토큰 | `kis_token_A/B.json` **7/16 12:30 갱신**. 오류 로그 없음 | — | ✅ |
| 잔고조회 함수 / A·B 매핑 | `kis_api.py:236` **`get_balance(token, trader_id="A")`** · systemd `Environment=TRADER_ID=A`(onehub) / `B`(onehub-b) | — | ✅ |
| stock_pool 실제 테이블/컬럼 | **DB 테이블 아님.** `stock_screener.py:33` 파이썬 리스트(`STOCK_POOL`), 292행 `_deduped` 재대입. dict 키 = `code/name/name_kr/sector/direction` | — | 실측 완료 |
| 거래일 포맷 | `trading.db`에 `raw_transactions` **없음**(부동산 `apartment.db` 소관). `trades.date` = `'2026-06-30 13:11:22'` (TEXT, `YYYY-MM-DD HH:MM:SS` KST) | — | 실측 완료 |
| 타임존 | 서버 **Etc/UTC**. 스케줄 UTC 23:50 = **08:50 KST 정시 실행** | — | ✅ H-D 기각 |
| 서비스 | **5종 전부 active** (onehub / onehub-b / onehub-api / onehub-realestate / onehub-etf). `onehub-stock`은 **존재하지 않는 이름** | — | 좌표 교정 |
| 포트 | 5001(onehub-api) · 5002(realestate) · 5003(etf) LISTEN | — | ✅ |
| `/api/version` · `/health` | **404 둘 다** | 404면 v9.x 미배포 증거 | ❌ **해석 오류** — 라우트가 애초에 없음. `engine_status_api.py`의 실제 경로는 `/api/health/status`(인증 필요). 버전 후퇴 증거 아님 |
| NRestarts | **0** (onehub·onehub-b). 7/7 13:55:29부터 9일 연속 가동 | — | ✅ |
| 마지막 정상 체결 | **2026-06-30 13:11:22** (솔브레인 BUY) | — | — |
| 마지막 정상 동작 추정 버전 | **v10.0.0-ops** (체결 당시와 현재가 동일 버전) | — | 롤백 없음 |
| `.bak` 파일 | **64개 전량 보존**(`ai_analyzer.py.bak_20260615_125319` ~ `db_logger.py.bak_queue_20260707_132916`) + `trading.db.bak_*` 3개 | — | 보존 |
| vscode History | **Y** — 단 **20K · 파일 2개**(`-38a061f7/HGwC.py` 외). 복원 단서 가치 **낮음** | — | 보존 |

---

## 증거 사슬 — 어디서 끊겼나

```
08:50 KST  morning_analysis → BUY 신호 생성 (pending)
           ↓ ★ 장 시작(09:00) 전이라 is_trading_time()=False
             → main.py:1342 자동매수 분기(AI_AUTONOMOUS_MODE and is_trading_time()
               and _is_strong_buy_signal)를 탈 수 없음 → 승인 대기로 이월
           ↓ 사용자 예약 → status='queued', scheduled_at=09:00
09:00 KST  queue_release.py (cron 0 0 * * 1-5)
           → status='approve_requested'                    ✅ 성공(로그 확인)
           ↓
           main.py _sync_pwa_approvals (30초 루프)
             if code in pending  → 'approved' → _auto_execute_approved_pending() → 체결
             else                → 'expired'  (★ 로그 없음)
           ↓
           ❌ 14.5시간 동안 아무 일도 일어나지 않음
08:30 KST  (익일) expire_all_pending → 'expired'
           제외 목록 ('done','rejected','expired','queued')에 'approve_requested' 없음
```

**7/15 실측 로그** (`/home/ubuntu/logs/queue_release.log.1`):
```
예약 주문 릴리스 (2026-07-15 09:00 KST)
1건을 09:00 승인 실행 대기로 전환했습니다:
- HMM(011200) BUY 79주
```
→ 릴리스까지 성공. 이후 `[v8.3] PWA 승인 반영` 로그 **없음**. 같은 시간대 `[CACHE HIT] balance_A`(동일 주기 잡)는 매분 기록 → **로그·스케줄러는 살아 있는데 이 경로만 침묵.**

**폴러가 죽은 게 아니라는 반증**: 7/9 10:33 `[v8.3] PWA 거절 반영: 000270 / 105560 / 950130 / 003090` — 정상 처리 이력 존재.

**주변 정상 확인**: 자율모드 ON(부팅 로그 `[v8.4] AI 자율 운영 모드 복원: ON`) · 스케줄러 정상(`while True: schedule.run_pending(); time.sleep(30)`, 등록은 전부 루프 앞) · DB 경로 일치(`HOME=/home/ubuntu` → `DB_PATH=/home/ubuntu/trading.db` = queue_release의 `DB`) · 주문 시도 로그 14일간 **0건**(`rt_cd=0`은 전부 조회 API).

---

## 거래 실적

| action | 건수 | 마지막 |
|---|---|---|
| BUY | 13 | **2026-06-30 13:11:22** |
| AUTO_STOP_SELL | 12 | 2026-07-09 12:30:03 |
| SELL | 2 | 2026-07-01 10:53:10 |

7/9 이후 거래 기록 **0건**. 최근 매도 3건은 전부 `Auto-Stop 30분 미응답`(-8만 / -9만 / -5.25만) — **승인 미응답이 손실로 직결된 사례**입니다.

`pending_signals` status 분포: **expired 32 · rejected 16 · 그 외 0**

---

## 부수 발견 (판정에 영향 없음, 별도 처리 필요)

| # | 발견 |
|---|---|
| 1 | `event_log`의 `BUY`/`BLOCK`/`SELL` 행은 **`created_at`이 NULL** — `job` 타입만 시각 보유. 30일 매수/차단 비율(W1-5 보조) 쿼리가 빈 결과인 이유. 권위 소스는 `trades` |
| 2 | `block_accuracy` 기록이 **2026-06-17에 멈춤** — 차단 정확도 추적 중단 |
| 3 | `_sync_pwa_approvals`의 `else`(code not in pending → expired) 분기에 **로그 없음** → 승인이 조용히 폐기되어 **재발해도 감지 불가** |
| 4 | `expire_all_pending` 제외 목록에 `approve_requested` 없음 → 릴리스된 승인이 익일 스윕에 쓸려나감 |

---

## Part 2로 넘기는 사항

| # | 내용 |
|---|---|
| 1 | **★ Part 2(v9.x 복원)는 폐기 권고.** 배포본이 v10.0.0-ops로 v9.x보다 앞섬 → 복원 = 신버전→구버전 롤백 사고. H-B 기각, 롤백 흔적 없음(NRestarts=0, mtime=기동시각 일치) |
| 2 | S-4의 실제 작업은 코드 복원이 아니라 **문서의 버전 기록 정정**(v8.2 → v10.0.0-ops) |
| 3 | vscode History(20K·2파일)·`.bak` 64개 **전량 보존됨**. 다만 복원 대상이 없으므로 포렌식 자체가 불요 |
| 4 | **Part 1이 남긴 유일한 미지수**: `_sync_pwa_approvals`가 `approve_requested` 행을 왜 못 봤는가. 이것이 매매 재개의 단일 열쇠 |

---

## 즉시 권고 (Part 2와 무관하게 선행 가능)

| 순위 | 조치 | 효과 |
|---|---|---|
| 1 | `_sync_pwa_approvals` else 분기에 로그 1줄 | 지금은 승인이 조용히 사라짐 → **보이게** 만듦 |
| 2 | `expire_all_pending` 제외 목록에 `approve_requested` 추가 검토 | 릴리스된 승인이 스윕에 쓸려나가는 것 방지 |
| 3 | 09:00 릴리스 후 집행 성공/실패를 텔레그램으로 통지 | 미응답 만료를 사용자가 인지 |

> 위 3건은 **엔진 로직 변경이 아니라 관측성 추가**입니다. 다만 안전규칙 1(스냅샷)·4(장중 배포 금지)·5(드라이런 1거래일)에 따라 **승인 후 장 마감 뒤 배포**해야 합니다.
