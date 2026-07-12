// scripts/gen-sitemap.mjs
// 빌드 시(prebuild) public/sitemap.xml 을 새로 생성한다.
// 매일 운영일지가 커밋→Vercel 재배포될 때마다 자동으로 최신 상태가 된다.
// (기존 정적 sitemap.xml 은 6월 초 이후 갱신이 멈춰 있었음 — 그 문제를 해소)
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const SITE = 'https://one-hub-content.vercel.app';
const root = process.cwd();
const today = new Date().toISOString().slice(0, 10);

// 색인 대상 정적 페이지(마케팅·콘텐츠 허브). 콘솔(/pwa, /api, /dashboard)은 제외.
const staticRoutes = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/daily', changefreq: 'daily', priority: '0.9' },
  { path: '/weekly', changefreq: 'weekly', priority: '0.8' },
  { path: '/blog', changefreq: 'weekly', priority: '0.7' },
  { path: '/story', changefreq: 'monthly', priority: '0.7' },
  { path: '/board/realestate', changefreq: 'daily', priority: '0.6' },
  { path: '/strategies', changefreq: 'weekly', priority: '0.6' },
  { path: '/engines', changefreq: 'weekly', priority: '0.6' },
  { path: '/community', changefreq: 'weekly', priority: '0.5' },
  { path: '/about', changefreq: 'monthly', priority: '0.5' },
];

// content/<dir> 의 .md 목록을 읽어 URL 엔트리로 변환.
// published:false 는 제외. lastmod 는 frontmatter.date 우선, 없으면 파일 mtime.
function collect(dir, urlPrefix, { changefreq, priority }) {
  const abs = path.join(root, 'content', dir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const full = path.join(abs, f);
      let published = true;
      let lastmod = today;
      try {
        const { data } = matter(fs.readFileSync(full, 'utf8'));
        if (data.published === false) published = false;
        lastmod = (data.date && String(data.date).slice(0, 10)) ||
          fs.statSync(full).mtime.toISOString().slice(0, 10);
      } catch {
        lastmod = fs.statSync(full).mtime.toISOString().slice(0, 10);
      }
      const slug = f.replace(/\.md$/, '');
      return published ? { loc: `${SITE}${urlPrefix}/${slug}`, lastmod, changefreq, priority } : null;
    })
    .filter(Boolean)
    .sort((a, b) => (a.lastmod < b.lastmod ? 1 : -1));
}

const entries = [
  ...staticRoutes.map((r) => ({ loc: `${SITE}${r.path === '/' ? '' : r.path}`, lastmod: today, changefreq: r.changefreq, priority: r.priority })),
  ...collect('daily', '/daily', { changefreq: 'never', priority: '0.7' }),
  ...collect('weekly', '/weekly', { changefreq: 'never', priority: '0.6' }),
  ...collect('blog', '/blog', { changefreq: 'monthly', priority: '0.5' }),
  ...collect('story', '/story', { changefreq: 'weekly', priority: '0.6' }),
];

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  entries
    .map(
      (e) =>
        `  <url>\n` +
        `    <loc>${e.loc}</loc>\n` +
        `    <lastmod>${e.lastmod}</lastmod>\n` +
        `    <changefreq>${e.changefreq}</changefreq>\n` +
        `    <priority>${e.priority}</priority>\n` +
        `  </url>`
    )
    .join('\n') +
  `\n</urlset>\n`;

const out = path.join(root, 'public', 'sitemap.xml');
fs.writeFileSync(out, xml, 'utf8');
console.log(`[gen-sitemap] wrote ${entries.length} urls → public/sitemap.xml`);
