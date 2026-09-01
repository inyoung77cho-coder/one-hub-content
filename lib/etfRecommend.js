// [ETF 재구성 Phase1] 규칙기반 ETF 후보 추천 — 순수/동기 함수(fetch 없음).
//   목표배분(onehub_target_alloc)이 있으면 '목표 대비 부족 지역'을, 없으면
//   overlap(섹터 집중) 기반 '분산 갭'을 근거로 최대 5개 버킷 제안.
//   이유(reasonRule)는 Phase1 규칙 문구. 티커(ticker)는 선택(버킷 단위 안내 가능).
//   Phase2에서 Claude가 이유를 다듬을 자리를 남겨둔다.
import { classifyEtf } from "./etfClassify";

// 지역 버킷별 대표 ETF 예시(참고용 — 특정 추천/권유 아님). null 이면 버킷 단위 안내.
const REGION_BUCKET = {
  미국: { name: "미국 대형주 ETF (예: TIGER 미국S&P500)", ticker: null },
  중국: { name: "중국 대표지수 ETF (예: TIGER 차이나CSI300)", ticker: null },
  선진국: { name: "선진국 분산 ETF (예: 선진국 MSCI)", ticker: null },
  신흥국: { name: "신흥국 분산 ETF (예: 신흥국 MSCI)", ticker: null },
  해외: { name: "해외 분산 ETF", ticker: null },
  국내: { name: "국내 대표지수 ETF (예: KODEX 200)", ticker: null },
};

function bucketFor(region) {
  return REGION_BUCKET[region] || { name: `${region} 지역 ETF`, ticker: null };
}

// 보유(holdings)+백엔드 positions 를 투자지역별 금액 비중으로 집계.
function regionWeights(items) {
  const by = {};
  let total = 0;
  (items || []).forEach((x) => {
    const v = Number(x?.valueKrw) || 0;
    if (!(v > 0)) return;
    const c = classifyEtf(x.ticker);
    const region = c ? (c.a || c.r) : "미상";
    by[region] = (by[region] || 0) + v;
    total += v;
  });
  const out = {};
  Object.entries(by).forEach(([k, v]) => { out[k] = total > 0 ? (v / total) * 100 : 0; });
  return { weights: out, total };
}

export function recommendEtfs({ holdings = [], positions = [], target = null, overlap = null } = {}) {
  const items = [...(positions || []), ...(holdings || [])].filter((x) => x && x.ticker && Number(x.valueKrw) > 0);
  const recs = [];

  // ── 1) 목표배분이 있으면 목표 대비 부족 지역을 채운다 ──
  //   목표배분은 국내/해외 2축(onehub_target_alloc.region = { 국내, 해외 }).
  const tgt = target?.region || null;
  if (tgt && items.length) {
    const { weights } = regionWeights(items);
    // 국내/해외 대분류 현재 비중
    let osCur = 0, dmCur = 0;
    Object.entries(weights).forEach(([region, w]) => {
      const isOs = region !== "국내" && region !== "미상";
      if (isOs) osCur += w; else if (region === "국내") dmCur += w;
    });
    const osGap = (Number(tgt.해외) || 0) - osCur;
    const dmGap = (Number(tgt.국내) || 0) - dmCur;
    if (osGap >= 5) {
      const b = bucketFor("미국");
      recs.push({ name: b.name, ticker: b.ticker, axis: "region", bucket: "해외",
        reasonRule: `해외 비중이 목표(${tgt.해외}%) 대비 ${osGap.toFixed(0)}%p 낮아 미국 등 해외 ETF로 보완이 필요합니다.` });
    }
    if (dmGap >= 5) {
      const b = bucketFor("국내");
      recs.push({ name: b.name, ticker: b.ticker, axis: "region", bucket: "국내",
        reasonRule: `국내 비중이 목표(${tgt.국내}%) 대비 ${dmGap.toFixed(0)}%p 낮아 국내 대표지수 ETF로 보완이 필요합니다.` });
    }
  }

  // ── 2) 섹터 과집중(overlap) → 분산 보완 버킷 ──
  const topSec = overlap?.sectors?.[0];
  if (topSec && (Number(topSec.weight) || 0) >= 0.35) {
    recs.push({
      name: `${topSec.sector} 외 분산 ETF (경기방어·배당 등)`, ticker: null,
      axis: "sector", bucket: topSec.sector,
      reasonRule: `${topSec.sector} 섹터 실효 노출이 ${(topSec.weight * 100).toFixed(0)}%로 과집중입니다 — 다른 섹터 ETF로 분산하면 리스크가 낮아집니다.`,
    });
  }

  // ── 3) 목표도 과집중도 없을 때: 보유 지역 다양성 갭 ──
  if (!recs.length && items.length) {
    const { weights } = regionWeights(items);
    const regions = Object.keys(weights);
    const hasOverseas = regions.some((r) => r !== "국내" && r !== "미상");
    const hasDomestic = regions.includes("국내");
    if (!hasOverseas) {
      const b = bucketFor("미국");
      recs.push({ name: b.name, ticker: b.ticker, axis: "region", bucket: "해외",
        reasonRule: "현재 해외 지역 노출이 없어, 미국 등 해외 ETF를 더하면 지역 분산이 넓어집니다." });
    }
    if (!hasDomestic) {
      const b = bucketFor("국내");
      recs.push({ name: b.name, ticker: b.ticker, axis: "region", bucket: "국내",
        reasonRule: "현재 국내 지역 노출이 없어, 국내 대표지수 ETF를 더하면 통화·지역 분산에 도움이 됩니다." });
    }
    // 종목 수가 적으면 광범위 분산 제안
    if (recs.length < 2 && items.length <= 2) {
      recs.push({ name: "광범위 분산형 ETF (전세계·전종목)", ticker: null, axis: "region", bucket: "분산",
        reasonRule: `보유 종목이 ${items.length}개로 적어, 한 종목의 등락이 전체에 크게 작용합니다 — 광범위 분산형 ETF로 변동성을 낮출 수 있습니다.` });
    }
  }

  // ── 4) 추천 후보가 하나도 없을 때 — [S21-2] '추천 없음'을 '보유 없음'으로 오인하지 않게 보유 건수로 분기 ──
  if (!recs.length) {
    if ((holdings || []).length === 0) {
      // 정말 보유가 없을 때만 '시작 가이드'.
      recs.push({ name: "국내 대표지수 ETF (예: KODEX 200)", ticker: null, axis: "region", bucket: "국내",
        reasonRule: "보유 ETF가 없어 시작 후보로 국내 대표지수 ETF를 제안합니다 — 저비용·분산의 기본 축입니다." });
      recs.push({ name: "미국 대형주 ETF (예: TIGER 미국S&P500)", ticker: null, axis: "region", bucket: "해외",
        reasonRule: "지역 분산을 위해 미국 대형주 ETF를 함께 고려할 수 있습니다." });
    } else {
      // 보유는 있으나 규칙상 뚜렷한 조정 후보가 없음 — 사실에 맞는 문장.
      recs.push({ name: "지금은 뚜렷한 조정 후보 없음", ticker: null, axis: "region", bucket: "유지",
        reasonRule: "지금 배분에서 뚜렷한 조정 후보가 없습니다 — 목표 배분을 정하면 더 구체적으로 제안합니다." });
    }
  }

  return recs.slice(0, 5);
}
