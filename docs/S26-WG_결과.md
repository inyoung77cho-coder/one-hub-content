# S26-WG 결과 — 테마별 목표어 통합 클립 (S26-12 · 유일한 기능 추가)

> 2026-09-04 · 선행 S26-WF(`6be5b3c`) · "그 언어로 설명해 주는" 통합 클립. 앞 6묶음이 다 된 뒤 마지막.

## 계측 5숫자 (변화 없음 — 기능 추가라 표현 지표 무관)
| 측정 | 값 | 목표 |
|---|---|---|
| font-size 리터럴 고유값 | 4 | 8 |
| border-radius 리터럴 선언 | 47 | 0 |
| 카드 클래스 정의(이름 card) | 39 | 1 |
| 탭 구현체(클래스 정의) | 9 | 1 |
| 하단여백 토큰 미적용 페이지 | 0 | 0 |

## 구현한 것 (프론트 — 배포 완료·안전 저하)
1. **`lib/clipNarration.js`(신규)** — 테마별 나레이션 성격 상수(`THEME_NARRATION`: 경제=브리핑 톤·숫자/기업명 또박또박, 디스플레이=산업 용어 2~3개 되짚기, 회화=상황 먼저 설명) + 서버 프롬프트 정본(`THEME_PROMPT`) + **클립 조립기 `assembleThemeClip`**.
   - 조립: `[intro] + (레슨 + 브리지)… + [outro] (+ 한국어 요약 옵션)`. **본문은 기존 레슨 오디오 그대로**, 브리지만 목표어.
   - 서버가 브리지 **텍스트**(LLM)를 주면 클라가 `/api/english/speak`(edge-tts·무료)로 오디오화 → **LLM 비용은 서버에서 하루·테마당 1회, 재생 TTS 는 무료**.
   - **생성 실패/미배포 시 `narration.ok!==true` → 브리지 없이 레슨만 이어붙여 재생**(클립 자체는 실패 안 함).
2. **`pages/api/english/[fn].js`** 화이트리스트에 `theme-clip` 추가 → `:5005 /english/theme-clip?track=&language=&level=`. 미배포/타임아웃 시 프록시 catch 가 폴백 → 레슨만.
3. **`pages/pwa/clip.js`** — `?track=&lang=` 이면 **테마 모드**: 레슨(`today?track=&language=`) + 나레이션(`theme-clip`) → `assembleThemeClip`. **AudioPlaylist 재사용(재생목록 하나·다음 한 편만 preload·자동재생 없음)**. 한국어 요약 **토글**(`onehub_clip_kosummary`, 기본 켜짐). `AI 해설` 로 명시(레슨 원문인 척 안 함).
4. **`pages/pwa/english.js`** — 각 테마 화면 하단에 진입 링크 `🎧 {테마} 전체 듣기 · N편 · {언어} 해설 →` (`/pwa/clip?track=&lang=`).

## 서버(:5005) — ✅ 배포·검증 완료 (2026-09-04, S27 세션)
`app/api/lessons.py` 에 `@router.get("/theme-clip")` 추가·배포(`onehub-english` restart, active). **`llm.chat_json`(guard+log_usage=비용 서킷브레이커 내장) 경유**, `data/theme_clip/{lang}_{track}_{date}.json` **파일 캐시(테마당 하루 1회)**.
검증: `economy/en` 1차 생성 ok=True(intro·bridges 2·한국어 요약), 2차 1.8s 캐시(LLM 미호출). 프론트가 이제 실제 목표어 브리지를 받는다.

<details><summary>배포한 라우트(참고)</summary>

### 추가할 라우트 `/english/theme-clip` (FastAPI, 개념 코드)
```python
# 테마당 하루 한 번만 생성·캐시. 사용자마다가 아니라 결과가 모두 같으므로 (track,language,date) 키.
# 반드시 기존 비용 서킷브레이커(call_and_log/guard)를 경유. 실패 시 {"ok": false} 반환(프론트가 레슨만 재생).
_THEME_CLIP_CACHE = {}  # {(track,language,date): payload}  또는 SQLite 테이블 theme_clip_cache
THEME_PROMPT = {  # lib/clipNarration.js THEME_PROMPT 와 동일 의도
  "economy": "Short, easy bridge sentences ... briefing tone, read numbers/company names clearly.",
  "display": "... restate 2-3 industry terms at the end.",
  "general": "... explain the situation first (conversational).",
}
@app.get("/english/theme-clip")
def theme_clip(track: str, language: str = "en", level: str = "basic"):
    from datetime import date
    key = (track, language, date.today().isoformat())
    if key in _THEME_CLIP_CACHE:
        return _THEME_CLIP_CACHE[key]
    lessons = fetch_today_lessons(track=track, language=language)   # 이미 있는 today 로직 재사용
    if not lessons:
        return {"ok": False, "reason": "no_lessons"}
    if not cost_guard_ok():           # ★ 기존 서킷브레이커. 초과면 브리지 생략
        return {"ok": False, "reason": "budget"}
    titles = [l.get("title_en") or l.get("title") for l in lessons][:6]
    prompt = (THEME_PROMPT.get(track, THEME_PROMPT["economy"]) +
              f"\nTarget language: {'Chinese' if language=='zh' else 'English'}. "
              "Use short, simple vocabulary (bridges must be easier than the articles). "
              "Return strict JSON: {\"intro\":\"..\",\"bridges\":[\"..\"],\"outro\":\"..\",\"outro_ko\":\"..(Korean one-line summary)\"}.\n"
              "Today's items:\n- " + "\n- ".join(titles))
    try:
        data = call_and_log(claude_json, prompt, max_tokens=1200)   # ★ 계측 경유. thinking이 max_tokens 잠식 주의(메모리)
        payload = {"ok": True, "intro": data.get("intro",""), "bridges": data.get("bridges",[]),
                   "outro": data.get("outro",""), "outro_ko": data.get("outro_ko","")}
    except Exception:
        payload = {"ok": False, "reason": "gen_failed"}
    _THEME_CLIP_CACHE[key] = payload
    return payload
```
실제 배포본은 파일 캐시를 씀(SQLite 대신 `data/theme_clip/*.json` — 재시작 견딤, 구현 단순). 첫 사용자가 테마·언어별 하루 첫 조회 시 1회 생성, 이후 캐시. (원하면 아침 6시 레슨 생성 뒤 6조합 프리생성 크론 추가 가능 — 현재는 온디맨드.)
</details>

## 합격선 점검
- [x] 경제·디스플레이·회화 각각에 목표어 해설 클립 진입(테마별 링크 + clip 테마 모드)
- [x] 브리지가 목표어, 본문은 기존 레슨 오디오 그대로(assembleThemeClip)
- [x] 생성 실패/미배포 시 레슨만으로 재생(안전 저하) · 자동재생 없음 · `AI 해설` 명시 · 재생목록 하나
- [x] 설정에서 한국어 요약 끄기(토글)
- [x] **나레이션 하루 한 번·테마당 한 번** — 파일 캐시로 검증(2차 호출 LLM 미호출·1.8s)
- [~] 하루 한 클립(S25-10)의 ⑥ 외국어 구간을 이 테마 클립으로 **완전 교체** — 현재는 전용 테마 클립으로 목표어 해설 제공, daily ⑥ 병합은 후속(sync 조립을 async 로 바꿔야 함). ⚠️ 후속.

## 커밋
- `S26 WG: 테마별 목표어 통합 클립 프론트(clipNarration+clip 테마모드+진입링크). 서버 엔드포인트는 배포용 제공`
