// [S31-6] 제휴 클릭 카운터(+1) — 자체 카운터만(외부 추적 스크립트 없음). 로그인 뒤(/api/pwa/=보호).
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  try {
    await fetch(`${RE_API}/api/v2/public-metric?name=partner_click${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`, {
      method: "POST", headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(4000),
    }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
