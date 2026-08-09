import { bodyWithTenant } from "../../lib/reqTenant";
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

// [2026-08-09] Claude 비용 절감 3단계 계획 step 3 — PWA가 최근에 열렸는지만 기록한다.
// hourly_screen_refresh(백엔드 cron)가 이 타임스탬프를 보고 90분 이상 미접속이면 opus 스캔을 스킵한다.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Method not allowed" });
  try {
    const upstream = await fetch(`${ENGINE_API}/api/heartbeat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.PWA_API_KEY || "",
      },
      body: JSON.stringify(bodyWithTenant(req)),
      signal: AbortSignal.timeout(5000),
    });
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    return res.status(200).json({ ok: false, _offline: true });
  }
}
