// [S17-0 Part3 W3-4] 엔진 버전·API 계약 프록시.
//   PWA 가 부팅 시 1회 호출해 자기 기대값(api_contract)과 대조한다.
//   이번 사고(코드 후퇴를 수개월간 아무도 모름)가 늦게 발견된 이유는
//   '지금 서버가 무슨 버전인지' 묻는 창구가 없어서였다.
const ENGINE_API = process.env.ENGINE_API_URL || "http://54.180.54.132:5001";

export default async function handler(req, res) {
  try {
    const upstream = await fetch(`${ENGINE_API}/api/version`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!upstream.ok) throw new Error(`Upstream ${upstream.status}`);
    const d = await upstream.json();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json({ ok: true, ...d });
  } catch (err) {
    // ★ 실패를 0/빈값으로 위장하지 않는다. 못 물어봤다는 사실 그대로 돌려준다.
    return res.status(200).json({ ok: false, error: String(err.message || err) });
  }
}
