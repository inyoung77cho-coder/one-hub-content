// ONE-HUB v10 — ETF 엔진(onehub-etf.service, port 5003) 프록시
// 기존 ENGINE_API_URL 패턴 계승. 프로덕션(Vercel)은 ETF_API_URL 환경변수로 실백엔드 지정.
// ⚠️ 5003은 AWS Security Group 인바운드가 열려야 Vercel에서 도달 가능(P7 배포 전 SG 개방 필요).
//    로컬 개발은 SSH 터널(localhost:5003) + ETF_API_URL=http://localhost:5003 로 테스트.
const ETF_API = process.env.ETF_API_URL || "http://3.36.171.171:5003";

const ENDPOINTS = { report: "report", tax: "tax", overlap: "overlap", positions: "positions", rebalance: "rebalance" };

export default async function handler(req, res) {
  const fn = ENDPOINTS[req.query.fn];
  if (!fn) return res.status(404).json({ error: "unknown endpoint" });
  const trader = req.query.trader || "A";
  try {
    const resp = await fetch(`${ETF_API}/api/etf/${fn}?trader=${trader}`, {
      headers: { "X-API-Key": process.env.ETF_API_KEY || "" },
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message, hint: "ETF 서비스(5003) 도달 실패 — SG/터널 확인" });
  }
}
