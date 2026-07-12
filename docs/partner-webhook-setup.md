# 협력업체 매물 접수 → 구글 시트 연동 (turnkey)

`/partners/realestate` 폼 제출 흐름:

```
폼(pages/partners/realestate.js)
  → POST /api/partners/realestate   (검증 + Vercel 함수 로그 기록)
  → (PARTNER_WEBHOOK_URL 설정 시) 그 URL로 JSON 포워드
  → Google Apps Script(doPost)가 받아 구글 시트에 한 줄 추가
```

코드는 이미 배선돼 있습니다. **아래 2단계만 하면 폼 제출이 구글 시트에 자동 적재**됩니다.
(별도 서버·DB·유료 서비스 불필요. 구글 계정만 있으면 됩니다.)

---

## 1) 구글 시트 + Apps Script 배포 (약 2분)

1. 새 구글 시트 생성 → 1행에 헤더 입력(선택, 없으면 스크립트가 자동 생성):
   `receivedAt | company | manager | contact | ptype | deal | region | address | area | price | moveIn | realtime | memo | ua`
2. 시트 상단 메뉴 **확장 프로그램 → Apps Script**.
3. 기본 코드를 지우고 아래를 붙여넣기:

```javascript
// ONE-HUB 협력업체 매물 접수 웹훅 — 받은 JSON을 현재 스프레드시트 첫 시트에 append
const HEADERS = ['receivedAt','company','manager','contact','ptype','deal','region','address','area','price','moveIn','realtime','memo','ua'];

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || '{}');
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0];
    if (sheet.getLastRow() === 0) sheet.appendRow(HEADERS);         // 헤더 자동 생성
    sheet.appendRow(HEADERS.map(function (k) {
      const v = data[k];
      return v === undefined || v === null ? '' : (typeof v === 'boolean' ? (v ? 'Y' : 'N') : String(v));
    }));
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  }
}

function doGet() { return json({ ok: true, service: 'onehub-partner-webhook' }); }

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
```

4. **배포 → 새 배포 → 유형: 웹 앱**.
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자(익명 포함)**  ← 서버가 익명으로 POST하므로 필수
5. **배포**를 누르고, 나오는 **웹 앱 URL**(`https://script.google.com/macros/s/…/exec`)을 복사.

> 접수 알림을 원하면 Apps Script에 트리거를 추가하거나 `doPost` 안에서
> `MailApp.sendEmail('내메일', '신규 매물 접수', JSON.stringify(data))` 한 줄을 넣으면 됩니다.

---

## 2) Vercel 환경변수 설정 (약 30초)

Vercel 프로젝트 → **Settings → Environment Variables**:

| Key | Value |
|---|---|
| `PARTNER_WEBHOOK_URL` | 1단계에서 복사한 `.../exec` URL |

저장 후 **재배포**(Deployments → Redeploy, 또는 커밋 1회). 끝.
이후 `/partners/realestate` 제출이 구글 시트에 실시간으로 쌓입니다.

---

## 확인

```bash
# 로컬/프로덕션 어디서든 엔드포인트 단독 테스트
curl -X POST https://one-hub-content.vercel.app/api/partners/realestate \
  -H "Content-Type: application/json" \
  -d '{"company":"테스트공인","contact":"010-0000-0000","ptype":"아파트","region":"분당"}'
# → {"ok":true,"message":"접수되었습니다."}
```

`PARTNER_WEBHOOK_URL` 미설정 시에도 폼은 정상 동작하며 **Vercel 함수 로그**(Deployments → Functions → `/api/partners/realestate`)에서 접수 내용을 확인할 수 있습니다.

---

## 대안 (선택)

- **Slack 알림만 원할 때**: `PARTNER_WEBHOOK_URL`에 Slack Incoming Webhook URL을 넣어도 됩니다(간단 알림용).
- **이메일 발송**: Resend/SendGrid API 키가 있으면 `pages/api/partners/realestate.js`에 발송 로직을 추가할 수 있습니다(키 필요 → 알려주시면 배선).

---

## 공개 보드(`/board/realestate`)에 매물 게시하기

접수된 매물을 홈의 **부동산 신규 정보** 보드에 공개하려면, 시트/접수 내용을 `content/listings/*.md` 파일로 커밋합니다(블로그·운영일지와 동일한 콘텐츠 방식). 커밋 → Vercel 재빌드 시 보드에 자동 노출됩니다.

```markdown
---
title: "분당 서현 시범단지 84㎡"
region: "경기 성남시 분당구 서현동"
ptype: "아파트"      # 아파트·오피스텔·빌라/연립·상가·사무실·토지·기타
deal: "매매"          # 매매·전세·월세·분양
price: "13억 5,000"
area: "84.9"          # 전용 ㎡
partner: "한빛공인중개사"
date: "2026-07-10"
sample: false          # true면 '예시' 배지 표시(형식 안내용)
published: true
summary: "서현역 도보 7분·초품아, 저평가 구간."
---
```

> 현재 `content/listings/`에는 형식 안내용 **예시 3건**이 들어 있습니다(카드에 「예시」 배지). 실제 매물을 올릴 땐 `sample: false`로 새 파일을 추가하고, 예시는 지우면 됩니다.
> 자동화하려면 시트→md 변환 스크립트 또는 GitHub API(`pages/api/comments.js`가 쓰는 방식)로 접수 시 자동 커밋하도록 확장할 수 있습니다.
