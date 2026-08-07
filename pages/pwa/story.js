// [ⓓ 이야기 탭] 경량 커뮤니티 — 신규 게시판 없이, 오늘 날짜에 달리는 댓글 스레드를 피드로 노출.
//   저장은 기존 components/Comments.js + pages/api/comments.js(GitHub Issues 백엔드) 그대로 재사용.
import Head from "next/head";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Comments from "../../components/Comments";

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function PwaStory() {
  const date = todayKey();
  return (
    <div className="story">
      <Head><title>이야기 | ONE-HUB</title></Head>
      <AppHeader />
      <div className="story-title">💬 이야기 <span className="story-sub">오늘, 다른 사용자들과 나누는 이야기</span></div>
      <section className="card">
        <Comments date={date} />
      </section>
      <BottomNav active="story" />
      <style jsx>{`
        .story { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .story-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .story-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
