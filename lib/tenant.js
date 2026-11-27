// lib/tenant.js — 로그인 세션 → 테넌트(trader_id)·역할 파생. NI-4 계정 격리.
// 백엔드는 이미 trader_id로 필터하므로, "누가 로그인했나"를 서버에서 결정해
// trader_id로 매핑하면 격리가 성립한다. 클라이언트가 보낸 trader는 절대 믿지 않는다.
//
// InYoung(admin) = 기존 데이터 소유 tenant 'A'. (선택) 기존 친구 = 'B'.
// 그 외 신규 카카오 유저 = 'u' + kakaoId (안정·고유).

// NI-5 등급(tier) 규칙 — 지인 시험 단계:
//   admin = 운영자(InYoung). 그 외 로그인 유저 = 전부 beta + 평생무료(lifetime_free).
//   free/premium은 P3 대비 값만 정의(지금 로직 없음). 등급은 DB가 아니라 세션에서 파생.
export function tenantFromKakaoId(kakaoId) {
  const admin = process.env.ADMIN_KAKAO_ID || "";
  const bId = process.env.TENANT_B_KAKAO_ID || "";
  const id = String(kakaoId || "");
  if (!id) return null;
  if (admin && id === admin) {
    return { tenant: "A", role: "admin", tier: "admin", lifetimeFree: true };
  }
  if (bId && id === bId) {
    return { tenant: "B", role: "member", tier: "beta", lifetimeFree: true };
  }
  return { tenant: "u" + id, role: "member", tier: "beta", lifetimeFree: true };
}

// 세션 payload(sub = "kakao:123456") → { tenant, role }
export function tenantFromSession(session) {
  if (!session || !session.sub) return null;
  const sub = String(session.sub);
  const kakaoId = sub.startsWith("kakao:") ? sub.slice(6) : sub;
  return tenantFromKakaoId(kakaoId);
}

// [S47-0] B 계정의 앱 접근 차단 — 매매 데이터·봇과 무관하게 '로그인만' 막는다.
//   TENANT_B_LOGIN: 비었거나 "on" = 허용(기본·무회귀), "off" = 차단.
//   되돌리기: TENANT_B_LOGIN 을 비우거나 "on" 으로.
//   ★TENANT_B_KAKAO_ID 는 지우지 않는다 — middleware 의 운영자 A/B 조회가 B 개념을 쓴다.
//   ★호출부는 결과(true/false)만 쓴다. 카카오 id 를 로그·URL·에러 메시지에 넣지 말 것(PII).
export function isLoginBlocked(kakaoId) {
  const bId = process.env.TENANT_B_KAKAO_ID || "";
  const off = String(process.env.TENANT_B_LOGIN || "").toLowerCase() === "off";
  return !!(off && bId && String(kakaoId || "") === bId);
}

// [S47-0] 이미 발급된 세션(최대 30일)도 막기 위한 세션판 — middleware 이중 차단용.
export function isSessionLoginBlocked(session) {
  if (!session || !session.sub) return false;
  const sub = String(session.sub);
  return isLoginBlocked(sub.startsWith("kakao:") ? sub.slice(6) : sub);
}
