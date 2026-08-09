// lib/reports.js
// 서버 전용 유틸 — getStaticProps에서만 호출할 것 (fs 사용)
import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

// [이야기 탭 공지] content/announcements/*.md — 관리자가 파일을 커밋하면 노출.
//   frontmatter: date, type(youtube|kakao|notice), title, url(선택). 본문은 그대로 텍스트로 노출.
//   실 데이터가 없으면(빈 디렉토리) 그냥 빈 배열 — 가짜 공지를 만들어내지 않는다.
const ANNOUNCE_ICON = { youtube: '🎥', kakao: '💬', notice: '📢' };

export function getAnnouncements(limit = 5) {
  const contentDir = path.join(process.cwd(), 'content', 'announcements');
  try {
    const files = fs.readdirSync(contentDir).filter((f) => f.endsWith('.md')).sort().reverse();
    return files.slice(0, limit).map((file) => {
      const raw = fs.readFileSync(path.join(contentDir, file), 'utf8');
      const { data, content } = matter(raw);
      return {
        date: data.date ? String(data.date) : file.replace('.md', ''),
        type: data.type || 'notice',
        icon: ANNOUNCE_ICON[data.type] || '📢',
        title: data.title || '',
        url: data.url || null,
        body: (content || '').trim(),
      };
    }).filter((a) => a.title);
  } catch (e) {
    return [];
  }
}

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
