// [S34-3/5] 유튜브 유입 전환 집계 — 로그인 뒤(/api/pwa/=보호). 개인정보 없음(집계 카운터만).
//   signup: 영상별 tool_signup_<src>_<v> + 주차 signups. (base tool_signup·tool_signup_<src>는 온보딩이 이미 올림 — 중복 금지)
//   verdict: 주차 verdicts(첫 판단까지 기록 — 로드맵 중단기준 '가입 대비 첫판단 20%').
//   주차는 weekBounds(주간 리포트와 동일). src 는 지금 youtube 만.
import { isRegisteredVideo } from "../../../lib/videos";
import { weekBounds } from "../../../lib/weeklyDigest";

const RE_API = process.env.RE_API_URL || "http://54.180.54.132:5002";
const RE_KEY = process.env.RE_ACCESS_KEY || "";

function bump(url) {
  try { return fetch(`${RE_API}${url}${url.includes("?") ? "&" : "?"}${RE_KEY ? `key=${encodeURIComponent(RE_KEY)}` : ""}`, { method: "POST", headers: { "X-API-Key": RE_KEY }, signal: AbortSignal.timeout(4000) }).catch(() => {}); } catch (e) { return null; }
}

export default async function handler(req, res) {
  const metric = String(req.query.metric || "");
  const src = String(req.query.src || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16);
  const vRaw = String(req.query.v || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 3);
  const v = vRaw && isRegisteredVideo(vRaw) ? vRaw : ""; // 모르는 값 무시(증식 방지)
  if (src !== "youtube") return res.status(200).json({ ok: true, skipped: "src" });
  const wk = weekBounds().weekNo;
  try {
    if (metric === "signup") {
      // base(tool_signup)·source(tool_signup_youtube)는 온보딩이 이미 올린다 → 여기선 영상별+주차만.
      await Promise.all([
        v ? bump(`/api/v2/public-metric?name=tool_signup_${src}_${v}`) : null,
        v ? bump(`/api/v2/weekly-video?week=${wk}&video=${v}&metric=signups`) : null,
      ].filter(Boolean));
    } else if (metric === "verdict") {
      if (v) await bump(`/api/v2/weekly-video?week=${wk}&video=${v}&metric=verdicts`);
    } else {
      return res.status(400).json({ ok: false, error: "bad metric" });
    }
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(200).json({ ok: false });
  }
}
