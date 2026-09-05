// [S31-3] 공개 도구 → 가입 전환 카운터(+1). 로그인 뒤(/api/pwa/=보호)에서만 호출.
//   온보딩 완료 시 from=estimate 였던 사용자에 한해 1회. 개인정보 없음(합계만).
const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

export default async function handler(req, res) {
  try {
    // [출처 분리] src(youtube 등)가 오면 tool_signup(전체)와 tool_signup_<src> 둘 다 +1.
    const src = String(req.query.src || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
    const names = src ? ["tool_signup", `tool_signup_${src}`] : ["tool_signup"];
    await Promise.all(names.map((nm) =>
      fetch(`${RE_API}/api/v2/public-metric?name=${nm}${RE_KEY ? `&key=${encodeURIComponent(RE_KEY)}` : ""}`, {
        method: "POST", headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(4000),
      }).catch(() => {})
    ));
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
