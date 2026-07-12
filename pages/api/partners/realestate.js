// pages/api/partners/realestate.js
// 협력업체 부동산 매물/실시간 정보 접수 — 스텁 엔드포인트.
// ★영속화(DB/시트/메일)는 백엔드 연동 필요. 현재는 검증 + (옵션)웹훅 포워드 + 로그만.
//   PARTNER_WEBHOOK_URL 환경변수를 설정하면(예: Google Apps Script/Slack 수신 웹훅)
//   별도 코드 변경 없이 제출 데이터가 그 URL로 전달됩니다.
const REQUIRED = ['company', 'contact', 'ptype', 'region'];

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ ok: false, error: 'POST만 허용됩니다.' });
  }

  const body = typeof req.body === 'string' ? safeParse(req.body) : req.body || {};
  const missing = REQUIRED.filter((k) => !body[k] || String(body[k]).trim() === '');
  if (missing.length) {
    return res.status(400).json({ ok: false, error: `필수 항목 누락: ${missing.join(', ')}` });
  }

  const record = {
    company: str(body.company),
    manager: str(body.manager),
    contact: str(body.contact),
    ptype: str(body.ptype),
    deal: str(body.deal),
    region: str(body.region),
    address: str(body.address),
    area: str(body.area),
    price: str(body.price),
    moveIn: str(body.moveIn),
    realtime: !!body.realtime,
    memo: str(body.memo).slice(0, 2000),
    receivedAt: new Date().toISOString(),
    ua: str(req.headers['user-agent']).slice(0, 200),
  };

  // 옵션: 외부 웹훅으로 포워드 (env만 설정하면 동작 — 코드 변경 불필요)
  const webhook = process.env.PARTNER_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'partners/realestate', ...record }),
      });
    } catch (e) {
      console.error('[partners/realestate] webhook forward failed:', e?.message);
    }
  }

  // 최소한 서버 로그에는 남김 (Vercel Functions 로그에서 확인 가능)
  console.log('[partners/realestate] 접수:', JSON.stringify(record));

  return res.status(200).json({ ok: true, message: '접수되었습니다.' });
}

function str(v) { return (v == null ? '' : String(v)).trim(); }
function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
