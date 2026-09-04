// [ⓓ+OS-2 이야기 탭] 동네(법정동) 기반 게시판 — 신규 백엔드 없이, 기존 GitHub Issues 댓글 시스템을
//   지역명을 키로 재사용(components/Comments.js의 `date` prop은 단순 스레드 식별자일 뿐이라
//   날짜 대신 "서현동" 같은 지역명을 넘기면 그대로 지역별 스레드가 된다).
//   기본 지역은 등록된 부동산 대표단지에서 자동 추정, "지역변경"으로 직접 바꿀 수 있다.
import Head from "next/head";
import { useEffect, useState } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Comments from "../../components/Comments";
import { getStoryRegionOverride, setStoryRegionOverride, guessMyDong, guOf, REGIONS } from "../../lib/storyRegion";
import { recordSnapshot as recordRegionSnapshot, getRegionDelta } from "../../lib/storyRegionHistory"; // [S23 T-9] 지역별 이야기 증감(오늘 화면에서 이관)

export default function PwaStory() {
  const [region, setRegion] = useState("");
  const [guessed, setGuessed] = useState(null);
  const [picking, setPicking] = useState(false);
  const [pickGu, setPickGu] = useState(null); // [구→동] 1단계에서 고른 구 — null이면 구 선택 화면
  const [regionDelta, setRegionDelta] = useState(null); // [S23 T-9] 지역별 이야기 증감(오늘 화면에서 이관)

  // [S23 T-9] 지역별 이야기 건수 오늘치 적립 + 전날 대비 증감(오늘 화면과 같은 소스·스냅샷).
  useEffect(() => {
    fetch("/api/story-region-stats")
      .then((r) => r.json())
      .then((d) => { if (d?.ok && d.counts) { recordRegionSnapshot(d.counts); setRegionDelta(getRegionDelta()); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const override = getStoryRegionOverride();
    if (override) { setRegion(override); return; }
    fetch("/api/pwa/re/complexDongs")
      .then((r) => r.json())
      .then((d) => {
        const map = d?.map || (Array.isArray(d?.items) ? Object.fromEntries(d.items.map((x) => [x.단지명, x.법정동])) : null);
        const g = guessMyDong(map || {});
        setGuessed(g);
        setRegion(g || Object.values(REGIONS)[0][0]);
      })
      .catch(() => setRegion(Object.values(REGIONS)[0][0]));
  }, []);

  const openPicker = () => {
    setPickGu(guOf(region) || Object.keys(REGIONS)[0]);
    setPicking(true);
  };

  const pick = (dong) => {
    setStoryRegionOverride(dong);
    setRegion(dong);
    setPicking(false);
  };

  if (!region) return null; // 지역 확정 전까지는 렌더 안 함(스레드 키 확정 후 1회 로드)

  return (
    <div className="story">
      <Head><title>이야기 | ONE-HUB</title></Head>
      {/* [사용자 지시] 상위 메뉴는 고정하고 그 아래 내용만 스크롤 */}
      <div className="sticky-hdr">
        <AppHeader />
        <div className="story-title">
          <span className="story-fixed"><span className="story-region">{region}</span> 이야기 <span className="story-sub-inline">동네 수다{guessed === region ? " · 내 등록 단지 기준" : ""}</span></span>
          <button type="button" className="story-change" onClick={() => (picking ? setPicking(false) : openPicker())}>지역변경</button>
        </div>
      </div>

      {picking && (
        <section className="card story-picker">
          {/* [구→동] 1단계: 구 선택 */}
          <div className="story-picker-h">구 선택</div>
          <div className="story-picker-list">
            {Object.keys(REGIONS).map((gu) => (
              <button key={gu} className={`story-chip ${gu === pickGu ? "on" : ""}`} onClick={() => setPickGu(gu)}>{gu}</button>
            ))}
          </div>
          {/* [구→동] 2단계: 선택한 구 안의 동 */}
          {pickGu && (
            <>
              <div className="story-picker-h story-picker-h2">{pickGu} 안에서 동 선택</div>
              <div className="story-picker-list">
                {(REGIONS[pickGu] || []).map((d) => (
                  <button key={d} className={`story-chip ${d === region ? "on" : ""}`} onClick={() => pick(d)}>{d}</button>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* [S23 T-9] 지역별 이야기 증감 — 오늘 화면에서 이관. 변화 없거나 데이터 없으면 정직하게 안내. */}
      {regionDelta && regionDelta.deltas && regionDelta.deltas.filter((d) => d.delta !== 0).length > 0 && (
        <section className="card">
          <div className="story-rd-h">📊 지역별 이야기 증감 <span className="story-rd-sub">{regionDelta.prevDate} 대비</span></div>
          <div className="story-rd-list">
            {regionDelta.deltas.filter((d) => d.delta !== 0).slice(0, 6).map((d) => (
              <div className="story-rd-row" key={d.region}>
                <span className="story-rd-nick">{d.region}</span>
                <span className="story-rd-cnt">{d.count}건</span>
                <span className={d.delta > 0 ? "story-rd-up" : "story-rd-down"}>{d.delta > 0 ? "▲" : "▼"}{Math.abs(d.delta)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <Comments date={region} />
      </section>
      <BottomNav active="story" />
      <style jsx>{`
        .story { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        .story-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .story-fixed { flex-shrink: 0; }
        .story-rd-h { font-size: 0.86rem; font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .story-rd-sub { font-size: 0.68rem; font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .story-rd-list { display: flex; flex-direction: column; gap: 5px; }
        .story-rd-row { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; }
        .story-rd-nick { color: var(--color-ink-2); font-weight: 700; }
        .story-rd-cnt { color: var(--color-ink-3); }
        .story-rd-up { margin-left: auto; color: var(--color-danger, #dc2626); font-weight: 700; }
        .story-rd-down { margin-left: auto; color: var(--color-primary); font-weight: 700; }
        .story-region { color: var(--color-primary); }
        .story-sub-inline { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
        .story-change { margin-left: auto; flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: 11.5px; font-weight: 700; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .story-picker-h { font-size: 12px; font-weight: 800; color: var(--color-ink-2); margin-bottom: 10px; }
        .story-picker-h2 { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--color-line); }
        .story-picker-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .story-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: 12.5px; font-weight: 700; padding: 7px 13px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .story-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}
