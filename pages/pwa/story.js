// [ⓓ+OS-2 이야기 탭] 동네(법정동) 기반 게시판 — 신규 백엔드 없이, 기존 GitHub Issues 댓글 시스템을
//   지역명을 키로 재사용(components/Comments.js의 `date` prop은 단순 스레드 식별자일 뿐이라
//   날짜 대신 "서현동" 같은 지역명을 넘기면 그대로 지역별 스레드가 된다).
//   기본 지역은 등록된 부동산 대표단지에서 자동 추정, "지역변경"으로 직접 바꿀 수 있다.
import Head from "next/head";
import { useEffect, useState } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Comments from "../../components/Comments";
import { getStoryRegionOverride, setStoryRegionOverride, guessMyDong, KNOWN_DONGS } from "../../lib/storyRegion";

export default function PwaStory() {
  const [region, setRegion] = useState("");
  const [guessed, setGuessed] = useState(null);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    const override = getStoryRegionOverride();
    if (override) { setRegion(override); return; }
    fetch("/api/pwa/re/complexDongs")
      .then((r) => r.json())
      .then((d) => {
        const map = d?.map || (Array.isArray(d?.items) ? Object.fromEntries(d.items.map((x) => [x.단지명, x.법정동])) : null);
        const g = guessMyDong(map || {});
        setGuessed(g);
        setRegion(g || KNOWN_DONGS[0]);
      })
      .catch(() => setRegion(KNOWN_DONGS[0]));
  }, []);

  const pick = (dong) => {
    setStoryRegionOverride(dong);
    setRegion(dong);
    setPicking(false);
  };

  if (!region) return null; // 지역 확정 전까지는 렌더 안 함(스레드 키 확정 후 1회 로드)

  return (
    <div className="story">
      <Head><title>이야기 | ONE-HUB</title></Head>
      <AppHeader />
      <div className="story-title">
        💬 <span className="story-region">{region}</span> 이야기
        <button type="button" className="story-change" onClick={() => setPicking((v) => !v)}>지역변경</button>
      </div>
      <div className="story-sub">우리 동네 이웃들과 나누는 이야기{guessed === region ? " · 내 등록 단지 기준" : ""}</div>

      {picking && (
        <section className="card story-picker">
          <div className="story-picker-h">동네 선택</div>
          <div className="story-picker-list">
            {KNOWN_DONGS.map((d) => (
              <button key={d} className={`story-chip ${d === region ? "on" : ""}`} onClick={() => pick(d)}>{d}</button>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <Comments date={region} />
      </section>
      <BottomNav active="story" />
      <style jsx>{`
        .story { max-width: 480px; margin: 0 auto; padding: 0 14px calc(env(safe-area-inset-bottom, 0px) + 140px); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .story-title { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 4px; }
        .story-region { color: var(--color-primary); }
        .story-change { margin-left: auto; flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .story-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); margin: 0 2px 14px; }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .story-picker-h { font-size: 12px; font-weight: 800; color: var(--color-ink-2); margin-bottom: 10px; }
        .story-picker-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .story-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .story-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
