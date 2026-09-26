// [S20-PEN] 연금 엔진 API 헬퍼 — /api/pwa/pension/* 프록시 경유(:5003).
//   단일 소스 원칙: 화면은 snapshot/latest 만 읽는다. 금액은 만원 단위 표기 유틸 재사용(lib/fmt).
const BASE = "/api/pwa/pension";

async function j(url, opts) {
  const r = await fetch(url, opts);
  let d = null;
  try { d = await r.json(); } catch (e) { d = { ok: false, error: "bad response" }; }
  return { status: r.status, data: d };
}

export function pastePreview(accountId, text) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/paste`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, dry_run: true }),
  });
}
export function pasteSave(accountId, text) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/paste`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}
export function getSnapshot(accountId) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/snapshot/latest`);
}
export function getRisk(accountId) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/risk`);
}
export function getDiagnose(accountId) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/diagnose`);
}
export function makePlan(accountId, body = {}) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/plan`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
export function getActions(accountId, date) {
  const q = date ? `?account_id=${encodeURIComponent(accountId)}&date=${date}` : `?account_id=${encodeURIComponent(accountId)}`;
  return j(`${BASE}/actions${q}`);
}
export function setActionStatus(actionId, body) {
  return j(`${BASE}/actions/${actionId}/status`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}
export function getHousehold(hid) {
  return j(`${BASE}/household/${encodeURIComponent(hid)}/summary`);
}
export function getCalendar(accountId, weeks = 2) {
  return j(`${BASE}/${encodeURIComponent(accountId)}/calendar?weeks=${weeks}`);
}

// 심각도 → 시맨틱 색 토큰(하드코딩 색상 금지, E-5)
export const SEV_COLOR = {
  HIGH: "var(--color-danger, var(--color-warning))",
  MID: "var(--color-warning)",
  LOW: "var(--color-ink-3)",
  INFO: "var(--color-muted)",
};
