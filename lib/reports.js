// lib/reports.js
// 서버 전용 유틸 — getStaticProps에서만 호출할 것 (fs 사용)
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

export function getLatestDailyReport() {
  const contentDir = path.join(process.cwd(), 'content', 'daily');
  let latestReport = null;
  try {
    const files = fs.readdirSync(contentDir)
      .filter(f => f.endsWith('.md'))
      .sort()
      .reverse();
    if (files.length > 0) {
      const raw = fs.readFileSync(path.join(contentDir, files[0]), 'utf8');
      const { data } = matter(raw);
      if (data.published !== false) {
        latestReport = {
          date: data.date || files[0].replace('.md', ''),
          regime: data.regime || 'SIDEWAYS',
          trade_count: data.trade_count || 0,
          block_count: data.block_count || 0,
          insight: data.insight || '',
        };
      }
    }
  } catch (e) {
    latestReport = null;
  }
  return latestReport;
}
