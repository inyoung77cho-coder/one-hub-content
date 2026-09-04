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

// [S29-11] 회차 발행이 곧 공지 — 별도 공지 파일이 없을 때 최신 회차를 공지로 노출해
//   '공지 없음' 빈 카드가 매일 뜨는 걸 없앤다. 공개판(www) 링크로 건다.
export function getLatestEpisodeAnnounce() {
  const dir = path.join(process.cwd(), 'content', 'episodes');
  try {
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort().reverse();
    for (const file of files) {
      const { data } = matter(fs.readFileSync(path.join(dir, file), 'utf8'));
      if (data.published === false) continue;
      const slug = file.replace(/\.md$/, '');
      const summary = Array.isArray(data.summary) ? data.summary : [];
      return {
        date: data.date ? String(data.date) : slug,
        type: 'episode',
        icon: '📺',
        title: data.title || '이번 주 회차',
        url: `https://www.one-hub.kr/episodes/${slug}`,
        body: summary[0] || '이번 주 회차가 올라왔어요.',
      };
    }
  } catch (e) { /* 회차 없음 → null */ }
  return null;
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
