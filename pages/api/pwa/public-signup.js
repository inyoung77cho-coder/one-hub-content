// [S31-3] 공개 도구 → 가입 전환 카운터(+1). 로그인 뒤(/api/pwa/=보호)에서만 호출.
//   온보딩 완료 시 from=estimate 였던 사용자에 한해 1회. 개인정보 없음(합계만).
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  try {
    await fetch(`${RE_API}/api/v2/public-metric?name=tool_signup${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`, {
      method: "POST", headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(4000),
    }).catch(() => {});
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
