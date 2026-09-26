// S37후속 패키지 B 검증 — AI 진단 사실성. 실행: node scripts/aiAdvisor.dataquality.test.mjs
// 실제 계산 함수(lib/aiAssets)를 호출해 작업지시서(2026-09-26) 필수 검증표를 확인한다.
import { computeSummary, realRegion } from "../lib/aiAssets.js";
let P=0,F=0; const chk=(n,c)=>{console.log((c?"PASS ":"FAIL ")+n); c?P++:F++;};
const assets = { stock: 50e6, etf: 30e6, realestate: 100e6, cash: 20e6 };
const G = "안정형";
const em = (o) => ({ region:null, region_status:"unmeasured", sectors:[], sector_status:"unmeasured", ...o });

// 1) 동일 실자산에 예시 섹터만 변경 → 개인 점수·행동·금액 영향 없음
const a1 = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({ region:{domestic:70,overseas:30}, region_status:"complete", sectors:[{theme:"반도체",pct:37}] }) });
const a2 = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({ region:{domestic:70,overseas:30}, region_status:"complete", sectors:[{theme:"반도체",pct:90}] }) });
chk("예시 섹터 변경 → 점수·분산도·리밸런싱 동일", a1.liquid_score===a2.liquid_score && a1.subscores.diversification===a2.subscores.diversification && JSON.stringify(a1.rebalance)===JSON.stringify(a2.rebalance));
// 2) 지역·섹터 모두 없음 → 분산도 100 금지, 종합 미측정, 배분적합도 계산됨
const b = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({}) });
chk("지역·섹터 없음 → 분산도 null·종합 null·배분적합도 숫자", b.subscores.diversification===null && b.liquid_score===null && typeof b.subscores.allocation==="number");
// 3) 지역만 완전, 섹터 없음
const c = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({ region:{domestic:100,overseas:0}, region_status:"complete" }) });
chk("지역완전·섹터없음 → 지역표시·테마경고/희석 없음·종합 미측정·국내100%경고(사실)", c.equity.region.domestic===100 && !c.equity.warnings.some(w=>w.startsWith("theme_cap")) && !c.rebalance.equity_recompose.some(r=>r.label.includes("희석")) && c.liquid_score===null && c.equity.warnings.includes("region_concentration"));
// 4) 지역·섹터 모두 완전 → 정책 계산 유지
const d = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({ region:{domestic:70,overseas:30}, region_status:"complete", sectors:[{theme:"반도체",pct:40}], sector_status:"complete" }) });
chk("둘다 완전 → 분산도·종합 숫자·테마경고+희석 있음", typeof d.subscores.diversification==="number" && typeof d.liquid_score==="number" && d.equity.warnings.some(w=>w.startsWith("theme_cap")) && d.rebalance.equity_recompose.some(r=>r.label.includes("희석")));
// 5) 해외 보유 + 환율 없음
chk("환율없음+해외+국내 → partial·dropped1", (()=>{const r=realRegion([{ccy:"USD",avgPrice:100,shares:10},{ccy:"KRW",avgPrice:100,shares:10}],[],null);return r.status==="partial"&&r.dropped===1;})());
chk("전부 해외+환율없음 → unmeasured", (()=>{const r=realRegion([{ccy:"USD",avgPrice:100,shares:10}],[],null);return r.status==="unmeasured"&&r.domestic===null;})());
const e = computeSummary({ assets, tendencyOrStyle:G, equityMeta: em({ region:{domestic:100,overseas:0}, region_status:"partial", region_dropped:1 }) });
chk("region partial → 국내100%경고 없음·전환액 없음·분산도 미측정", !e.equity.warnings.includes("region_concentration") && !e.rebalance.equity_recompose.some(r=>r.label.includes("스왑")) && e.subscores.diversification===null);
// 6) 원장 실패
const f = computeSummary({ assets, tendencyOrStyle:G, ledgerFailed:true, equityMeta: em({ region:{domestic:70,overseas:30}, region_status:"complete", sectors:[{theme:"반도체",pct:40}], sector_status:"complete" }) });
chk("원장 실패 → data_ok=false·measurable=false", f.data_ok===false && f.measurable===false);
// 7) 주식형 0 / 온보딩 미완료
chk("주식형 0 → equity_measured=false", computeSummary({ assets:{stock:0,etf:0,realestate:100e6,cash:20e6}, tendencyOrStyle:G, equityMeta: em({}) }).equity_measured===false);
chk("온보딩 미완료 → policy null·onboarding_complete false", (()=>{const h=computeSummary({assets,tendencyOrStyle:"",equityMeta:em({})});return h.policy===null&&h.onboarding_complete===false;})());
chk("realRegion 대상없음 → null", realRegion([],[],null)===null);

console.log(`\n${P} passed, ${F} failed`); process.exit(F?1:0);
