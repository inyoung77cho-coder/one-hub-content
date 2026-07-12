# PC↔모바일 동기화 백엔드 엔드포인트 (배포 필요)

PWA의 자산 입력(주식·ETF·부동산 등)은 브라우저 `localStorage`에 저장되어 기기마다 따로 놉니다.
PC와 모바일을 정합하려면 **트레이더별 상태를 저장하는 백엔드 엔드포인트**가 필요합니다.
아래 두 엔드포인트를 엔진 서버(`54.180.54.132:5001`, `ENGINE_API`)에 추가·배포하면
프런트(`/api/user/state` 프록시 + `lib/syncManager.js`)가 자동으로 동기화합니다.

배포 전에는 프런트가 조용히 로컬만 사용하므로 **회귀가 없습니다**(동기화만 비활성).

## 계약(Contract)

- `GET /api/pwa/user-state?trader=A`
  → `{ "ok": true, "device": "mobile|pc", "updatedAt": 1720000000000, "payload": { "<key>": "<string>", ... } }`
  저장된 게 없으면 `{ "ok": false }`
- `POST /api/pwa/user-state`  body: `{ "trader": "A", "device": "mobile", "updatedAt": 1720000000000, "payload": { ... } }`
  → `{ "ok": true }`

`payload`는 동기화 대상 localStorage 키→문자열 맵입니다(프런트 `SYNC_KEYS`와 동일).
서버는 **마지막 POST를 그대로 저장**하면 됩니다. 충돌 시 '모바일 우선' 규칙은 프런트(`syncManager`)가
pull 단계에서 이미 해소하므로, 서버는 last-write 저장만 하면 됩니다.

## FastAPI 예시 (파일 저장 방식 — DB 있으면 교체)

```python
# pwa_user_state.py  — 엔진(5001) FastAPI 앱에 라우터로 추가
import json, os, time
from fastapi import APIRouter, Request

router = APIRouter()
STATE_DIR = os.path.join(os.path.dirname(__file__), "data", "user_state")
os.makedirs(STATE_DIR, exist_ok=True)

def _path(trader: str) -> str:
    safe = "".join(c for c in (trader or "A") if c.isalnum()) or "A"
    return os.path.join(STATE_DIR, f"{safe}.json")

@router.get("/api/pwa/user-state")
async def get_user_state(trader: str = "A"):
    p = _path(trader)
    if not os.path.exists(p):
        return {"ok": False}
    try:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        return {"ok": True, "device": d.get("device"), "updatedAt": d.get("updatedAt"), "payload": d.get("payload", {})}
    except Exception as e:
        return {"ok": False, "error": str(e)}

@router.post("/api/pwa/user-state")
async def post_user_state(req: Request):
    body = await req.json()
    trader = body.get("trader", "A")
    rec = {
        "device": body.get("device"),
        "updatedAt": body.get("updatedAt") or int(time.time() * 1000),
        "payload": body.get("payload", {}),
        "savedAt": int(time.time() * 1000),
    }
    try:
        with open(_path(trader), "w", encoding="utf-8") as f:
            json.dump(rec, f, ensure_ascii=False)
        return {"ok": True}
    except Exception as e:
        return {"ok": False, "error": str(e)}
```

메인 앱에 `app.include_router(router)` 추가 후 서비스 재시작하면 됩니다.
(real_estate 엔드포인트를 SSH로 올리셨던 것과 동일한 방식)

## 인증

프록시(`pages/api/user/state.js`)가 `x-api-key: PWA_API_KEY` 헤더를 전달합니다.
엔진에서 키 검증이 필요하면 다른 PWA 엔드포인트와 동일하게 처리하세요.
