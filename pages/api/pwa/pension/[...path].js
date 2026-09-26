// ONE-HUB — 연금(S20-PEN) 엔진 프록시. /api/pwa/pension/* → :5003 /api/pension/*
//   ETF 프록시와 동일 백엔드(onehub-etf.service, Flask). 다양한 경로/메서드를 포괄(catch-all).
//   ⚠️ 5003 SG 인바운드 개방 또는 SSH 터널 필요. 프로덕션은 Vercel env ETF_API_URL.
const ETF_API = process.env.ETF_API_URL || "http://54.180.54.132:5003";

export default async function handler(req, res) {
  const parts = [].concat(req.query.path || []);
  // 경로 화이트리스트(1st 세그먼트) — 임의 프록시 방지
  const allowed = new Set(["health", "actions", "plan", "household"]);
  const first = parts[0] || "";
  // account_id 기반 경로(<id>/snapshot|risk|diagnose|plan|paste|calendar)도 허용
  const okShape = allowed.has(first) || parts.length >= 2;
  if (!okShape) return res.status(404).json({ ok: false, error: "unknown endpoint" });

  const qs = req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const url = `${ETF_API}/api/pension/${parts.map(encodeURIComponent).join("/")}${qs}`;
  try {
    const init = {
      method: req.method,
      headers: { "X-API-Key": process.env.ETF_API_KEY || "", "Content-Type": "application/json" },
    };
    if (req.method !== "GET" && req.method !== "HEAD" && req.body != null) {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }
    const resp = await fetch(url, init);
    const text = await resp.text();
    res.status(resp.status);
    try { res.json(JSON.parse(text)); } catch { res.send(text); }
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message, hint: "연금 엔진(5003) 도달 실패 — SG/터널 확인" });
  }
}
