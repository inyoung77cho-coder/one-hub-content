// [S32-1] 주간 리포트용 빌드타임 매니페스트 — docs/*_결과.md(만든 것)·*_작업지시서.md(다음 주).
//   ★런타임(Vercel 서버리스)에서 docs 디렉터리를 읽는 건 파일 추적이 불안정하다.
//   그래서 빌드 시 한 번 스캔해 lib/generated/weeklyManifest.json 으로 번들한다(항상 가용).
//   prebuild 에서 gen-sitemap 과 함께 돈다. 날짜는 문서 안 첫 YYYY-MM-DD.
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const docs = path.join(root, "docs");
const outDir = path.join(root, "lib", "generated");
const out = path.join(outDir, "weeklyManifest.json");

function firstDate(text) {
  const m = text.match(/(20\d\d)-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function h1(text) {
  const m = text.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

// "S31-AA 결과 — 공개 실거래 통계 도구" → { sprint:"S31-AA", headline:"공개 실거래 통계 도구" }
function splitTitle(t) {
  if (!t) return { sprint: null, headline: t };
  const dash = t.split(/\s+[—-]\s+/);
  const left = dash[0].replace(/\s*(긴급\s*)?(작업지시서\s*)?결과\s*$/, "").trim();
  const headline = dash.length > 1 ? dash.slice(1).join(" — ").trim() : left;
  return { sprint: left || null, headline: headline || left };
}

let made = [];
let workorders = [];
try {
  const files = fs.readdirSync(docs).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const full = path.join(docs, f);
    let text = "";
    try { text = fs.readFileSync(full, "utf8"); } catch { continue; }
    const date = firstDate(text);
    const title = h1(text);
    if (/결과\.md$/.test(f) || /_결과\.md$/.test(f) || /결과/.test(title || "")) {
      const { sprint, headline } = splitTitle(title);
      made.push({ file: f, date, sprint, headline });
    }
    if (/작업지시서\.md$/.test(f) || /작업지시서/.test(title || "")) {
      // 배치 목록 + 첫 항목(다음 주 후보)
      const batches = [...text.matchAll(/^#{1,3}\s*배치\s+([A-Z]{2})\s*[—-]\s*(.+)$/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));
      const firstItem = (text.match(/^#{2,3}\s*(S\d+-\d+)\s*·\s*(.+)$/m) || [])[2] || null;
      const { sprint } = splitTitle(title);
      workorders.push({ file: f, date, sprint: sprint || (f.match(/S\d+/) || [])[0] || f, title, batches, firstItem });
    }
  }
} catch (e) {
  // docs 없음 → 빈 매니페스트(오류 안 던짐)
}

// 날짜 내림차순
made.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
workorders.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, JSON.stringify({ generatedAt: new Date().toISOString(), made, workorders }, null, 2));
console.log(`[weekly-manifest] made=${made.length} workorders=${workorders.length} → lib/generated/weeklyManifest.json`);
