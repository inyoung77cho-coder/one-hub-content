# S26-WE 결과 — AI · 듣는 경제 이관 + 듣는 경제 분류 축 전환(S26-11)

> 2026-09-04 · 선행 S26-WD(`b0d143e`) · index(AI 페이지)·english(듣는 경제).

## 계측 5숫자

| 측정 | WE 시작 | WE 끝 | 목표 |
|---|---|---|---|
| font-size 리터럴 고유값 | 86 | 59 | 8 |
| border-radius 리터럴 선언 | 385 | 271 | 0 |
| 카드 클래스 정의(이름 card) | 39 | 39 | 1 |
| 탭 구현체(클래스 정의) | 15 | 11 | 1 |
| 하단여백 토큰 미적용 페이지 | 0 | 0 | 0 |

M4 −4: index `.td-seg`(AI 심판석) + english `.en-langs`·`.en-tabs`·`.en-subtabs` 제거. M1/M2 큰 폭 감소(index·english가 리터럴을 많이 갖고 있었음). M3(카드)는 이번에도 미변경(WD 사유 동일 — Card 이관은 실기기 QA 필요).

## S26-9 · 표현 이관(index·english)
- font-size 리터럴 → `--fs-1…8` 최근접(sed), border-radius → `--radius-sm/md/card`(999/99px pill·30px·대형은 리터럴 유지).
- **index AI 심판석 `td-seg`(나 vs AI·AI 자기검증·기록) → 공용 `SegTabs`**. useSwipeTabs(`aiSwipe`)와 같은 index 계약 유지.
- ⚠️ index 헤드라인 `2.4rem`(38px)은 스케일 상한(fs-8=30px) 초과라 리터럴 유지(축소 시 대형 숫자 깨짐).

## S26-11 · 듣는 경제 분류 축 전환 (정보 구조 변경)

### 백엔드 확인(curl) — :5005는 track+language 를 **실제로 거른다**
```
GET /english/lessons?track=economy&language=en → track=economy 영어 항목
GET /english/lessons?track=display&language=zh → track=display 중국어 항목
GET /english/today?track=display&language=en   → items 2, 전부 track=display
```
→ **프론트가 `track` 을 보내는 것으로 끝**(전량 받아 클라 분류 불필요). API 계약 불변.

### 축 셋으로 분리
```
축1 언어  영어 · 중국어              SegTabs(2칸) · 상단
축2 테마  경제 · 디스플레이 · 회화    SegTabs(3칸) · 스와이프 대상(themeSwipe)
축3 형식  전체 · 뉴스 · 영상 · 이디엄  칩(en-fmts) · 스와이프 아님
```
- 상태: `lang`(en/zh) · `theme`(economy/display/general) · `fmt`(all/news/video/idiom). `mode`(en/gen/zh)+`tab`+`SUBTABS`+`MODES` 제거.
- 피드: `/api/english/today?track=${theme}&language=${lang}` (+ `medium` 은 형식≠전체일 때만). 주말은 `lessons?...&limit=7`.
- **스와이프는 테마 축에만**(2단 스와이프 금지). 언어는 세그 클릭.

### `gen`(일반영어) 대메뉴 해체 — 기능 없애지 않고 위치만 이동
- `live`(생활영어 유튜브, `LiveEnglish`) → **테마 "회화" + 언어 "영어" + 형식(전체/영상)** 에서 피드 위에 렌더.
- `review`(주말복습, `WeekendChat`) → **상단 링크 `📝 주말복습`**(내 단어장 옆). 누르면 학습 대신 패널, "← 학습으로" 로 복귀. API가 `language` 만 받는 테마 무관 기능이라 별도 자리 맞음.

### 라벨·상태·안내
- `TRACK_KO`/`TRACK_KO_ZH` 의 `general` → **"회화"**(두 언어 동일 글자 수 → 세그 폭 안정). LessonCard 배지도 자동 반영.
- **마지막 언어·테마 기억**: `onehub_listen_last`(기기별, SYNC 아님) — 재진입 시 복원.
- **빈 조합 안내**: 레슨 0건이면 탭을 숨기지 않고 "아직 준비된 학습이 없어요 · 다른 테마를 보시겠어요?"(회화+영어+영상/전체는 LiveEnglish 가 채우므로 안내 생략).
- 오늘의 듣기 재생목록 키/제목도 `${lang}_${theme}` 기준으로.

### ⚠️ URL 반영(item 5) — 이번엔 보류
`?lang=&track=` router.replace 는 블라인드 상태에서 라우팅 부작용 위험이 있어 넣지 않음. 기억(localStorage)이 핵심 UX 요구라 충족. URL 동기화는 실기기 QA 가능 시점의 소규모 후속.

## 합격선(S26-11)
- [x] 언어 2 · 테마 3 = 6조합 열림(백엔드 track 필터 확인)
- [x] 스와이프로 테마 변경, 언어 불변(themeSwipe)
- [x] 주말복습·라이브 사라지지 않고 새 자리에서 동작
- [x] 앱 재진입 시 마지막 언어·테마 기억
- [x] 빈 조합 안내 문구
- [ ] URL 반영 — 보류(위)
- ⚠️ 실기기 육안(6조합 전환·LiveEnglish·주말복습 패널) 확인은 로그인 게이트로 사용자 몫

## 커밋
- `S26 WE: index AI심판석 SegTabs + 폰트/모서리 토큰화`
- `S26 WE(S26-11): 듣는 경제 3축 분리(언어·테마·형식) + english 토큰화`
