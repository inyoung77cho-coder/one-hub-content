// lib/kakaoState.js — [S36-1] 카카오 OAuth state 를 HMAC 서명 토큰으로 만들고 검증한다.
//
// 왜: 기존엔 state 가 난수 한 개였고 CSRF 방어가 오로지 쿠키(oh_oauth) 하나에 걸려 있었다.
//   그 쿠키가 콜백 시점에 유실되면(인앱 브라우저 전환·start 중복호출·도메인 불일치·Max-Age 만료)
//   무조건 실패했다 — "첫 시도 실패, 다시 하면 됨" 증상의 원인.
// 해결: state 자체에 목적지(next)와 타임스탬프를 담아 서명한다. 서명이 있으니 위조가 불가능해
//   쿠키 없이도 검증되고 목적지가 복원된다. CSRF 방어는 '없애는' 게 아니라 '서명으로 대체'한다.
//   쿠키는 보조 방어(심층 방어)로 남긴다 — 콜백에서 있으면 대조하고, 없으면 서명만으로 통과.
import crypto from "crypto";

const TEN_MIN = 10 * 60 * 1000;

// 별도 키가 있으면 그걸, 없으면 세션 서명 키(AUTH_SECRET)를 재사용한다. ★하드코딩 금지.
function secret() {
  const s = process.env.KAKAO_STATE_SECRET || process.env.AUTH_SECRET;
  if (!s) throw new Error("KAKAO_STATE_SECRET / AUTH_SECRET 미설정");
  return s;
}

function b64url(str) {
  return Buffer.from(str, "utf8").toString("base64url");
}
function b64urlDecode(str) {
  return Buffer.from(str, "base64url").toString("utf8");
}
function sign(body) {
  return crypto.createHmac("sha256", secret()).update(body).digest("base64url").slice(0, 22);
}

function safeNext(n) {
  return typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/pwa";
}

// next 를 담아 서명된 state 토큰을 만든다. 반환: "body.sig"
export function makeState(next) {
  const payload = { n: safeNext(next), t: Date.now(), r: crypto.randomBytes(8).toString("hex") };
  const body = b64url(JSON.stringify(payload));
  return `${body}.${sign(body)}`;
}

// state 검증.
//   성공: { ok:true, next, body }
//   실패: { ok:false, reason:"bad_sig" }  또는  { ok:false, reason:"expired", next }
export function verifyState(state) {
  const [body, sig] = String(state || "").split(".");
  if (!body || !sig) return { ok: false, reason: "bad_sig" };

  const expect = sign(body);
  // 길이가 다르면 timingSafeEqual 이 throw → 먼저 거른다.
  if (sig.length !== expect.length) return { ok: false, reason: "bad_sig" };
  let equal = false;
  try {
    equal = crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect));
  } catch {
    equal = false;
  }
  if (!equal) return { ok: false, reason: "bad_sig" };

  let p;
  try {
    p = JSON.parse(b64urlDecode(body));
  } catch {
    return { ok: false, reason: "bad_sig" };
  }
  if (!p || typeof p.t !== "number") return { ok: false, reason: "bad_sig" };

  const next = safeNext(p.n);
  // 서명은 유효하나 오래된 토큰 — next 는 서명으로 보증되므로 재시도에 실어 보낼 수 있게 넘긴다.
  if (Date.now() - p.t > TEN_MIN) return { ok: false, reason: "expired", next };

  return { ok: true, next, body };
}
