// ONE-HUB — 연금(S20-PEN) 엔진 프록시. /api/pwa/pension/* → :5003 /api/pension/*
//   ETF 프록시와 동일 백엔드(onehub-etf.service, Flask). 다양한 경로/메서드를 포괄(catch-all).
//   ⚠️ 5003 SG 인바운드 개방 또는 SSH 터널 필요. 프로덕션은 Vercel env ETF_API_URL.
import { tenantQuery } from "../../../../lib/reqTenant";
const ETF_API = process.env.ETF_API_URL || "http://54.180.54.132:5003";

export default async function handler(req, res) {
  const parts = [].concat(req.query.path || []);
  // 경로 화이트리스트(1st 세그먼트) — 임의 프록시 방지
  const allowed = new Set(["health", "accounts", "actions", "plan", "household"]);
  const first = parts[0] || "";
  // account_id 기반 경로(<id>/snapshot|risk|diagnose|plan|paste|calendar)도 허용
  const okShape = allowed.has(first) || parts.length >= 2;
  if (!okShape) return res.status(404).json({ ok: false, error: "unknown endpoint" });

  // [S46 HH-A 누수 차단] :5003 연금 엔진은 household_id/account_id 만 보고 trader 를 확인하지 않는다.
  //   그래서 화면이 고정 'HH-A'·폴백 'A-PEN-01' 을 부르면 B·신규 카카오 사용자도 A 의 연금을 읽고(쓰고) 있었다.
  //   서버 테넌시가 생기기 전까지 이 프록시가 소유를 강제한다. tenant 는 middleware 가 세션에서 넣은
  //   x-oh-tenant(클라 위조 불가 — 미들웨어가 항상 덮어씀)만 믿는다.
  //   · household/<hid>/*  : hid === `HH-${tenant}` 일 때만. 아니면 서버의 '연금 미등록' 응답과 같은 모양(404)
  //                           → lib/ledger.js 는 pension_uk=null·경고 없음으로 처리(남의 연금 대신 '없음').
  //   · <account_id>/*, actions?account_id= : accounts?trader=<tenant> 목록에 있는 계좌만.
  //   · actions/<id>/status, plan/<id>/activate : id→계좌 역추적 API 가 없어, 연금 계좌가 하나라도 있는
  //                           tenant 만 허용(계좌 없는 신규 사용자 차단 — 부분 방어).
  const tenant = String(req.headers["x-oh-tenant"] || "");
  if (!tenant) return res.status(401).json({ ok: false, error: "unauthorized" });
  const deny = (error) => res.status(404).json({ ok: false, error });
  const apiHeaders = { "X-API-Key": process.env.ETF_API_KEY || "", "Content-Type": "application/json" };
  const ownedAccounts = async () => {
    try {
      const r = await fetch(`${ETF_API}/api/pension/accounts?trader=${encodeURIComponent(tenant)}`, { headers: apiHeaders });
      const d = await r.json();
      return new Set((d?.ok && Array.isArray(d.accounts) ? d.accounts : []).map((a) => String(a.account_id)));
    } catch { return null; }
  };
  if (first === "household") {
    if (String(parts[1] || "") !== `HH-${tenant}`) return deny("가구 계좌/스냅샷 없음");
  } else if (first === "actions" || first === "plan" || !allowed.has(first)) {
    const owned = await ownedAccounts();
    if (owned == null) return res.status(502).json({ ok: false, error: "연금 계좌 소유 확인 실패", hint: "연금 엔진(5003) 도달 실패 — SG/터널 확인" });
    if (!allowed.has(first)) {
      if (!owned.has(first)) return deny("계좌 없음");
    } else if (first === "actions" && parts.length === 1) {
      if (!owned.has(String(req.query.account_id || ""))) return deny("계좌 없음");
    } else if (owned.size === 0) {
      return deny("계좌 없음");
    }
  }

  // [S47 후속] 클라 쿼리의 trader/trader_id 는 버리고 서버 테넌트로(accounts?trader= 위조 차단).
  const qsp = tenantQuery(req, tenant, ["path"]);
  const qs = qsp.toString() ? "?" + qsp.toString() : "";
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
