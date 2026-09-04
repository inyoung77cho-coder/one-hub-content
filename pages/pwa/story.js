// [ⓓ+OS-2 이야기 탭] 동네(법정동) 기반 게시판 — 신규 백엔드 없이, 기존 GitHub Issues 댓글 시스템을
//   지역명을 키로 재사용(components/Comments.js의 `date` prop은 단순 스레드 식별자일 뿐이라
//   날짜 대신 "서현동" 같은 지역명을 넘기면 그대로 지역별 스레드가 된다).
//   기본 지역은 등록된 부동산 대표단지에서 자동 추정, "지역변경"으로 직접 바꿀 수 있다.
import Head from "next/head";
import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import Comments from "../../components/Comments";
import EpisodeCard from "../../components/EpisodeCard"; // [S29-7] 이번 주 회차
import EpisodeReactions from "../../components/EpisodeReactions"; // [S29-9] 반응·투표
import ShareButton from "../../components/ShareButton"; // [S29-10] 공유는 공개판(www)으로
import { buildEpisodeDraft } from "../../lib/episodeDraft"; // [S29-8] 대본 초안
import { getIsOperator } from "../../lib/isOperator"; // [S29-8] 운영자만
import { getStoryRegionOverride, setStoryRegionOverride, guessMyDong, guOf, REGIONS } from "../../lib/storyRegion";
import { recordSnapshot as recordRegionSnapshot, getRegionDelta } from "../../lib/storyRegionHistory"; // [S23 T-9] 지역별 이야기 증감(오늘 화면에서 이관)
import { cachedJson } from "../../lib/quoteCache"; // [S29-3] GET 디둡·캐시

export default function PwaStory({ episodes = [] }) {
  const router = useRouter();
  const [pastOpen, setPastOpen] = useState(false);
  const [isOp, setIsOp] = useState(false);
  const [draft, setDraft] = useState(null);
  const isSat = typeof window !== "undefined" && new Date().getDay() === 6;
  useEffect(() => {
    let a = true;
    getIsOperator().then((v) => { if (!a) return; setIsOp(v); if (v) buildEpisodeDraft().then((d) => a && setDraft(d)).catch(() => {}); });
    return () => { a = false; };
  }, []);
  const latestEp = episodes[0] || null;
  const pastEps = episodes.slice(1);
  const [region, setRegion] = useState("");
  const [guessed, setGuessed] = useState(null);
  const [picking, setPicking] = useState(false);
  const [pickGu, setPickGu] = useState(null); // [구→동] 1단계에서 고른 구 — null이면 구 선택 화면
  const [regionDelta, setRegionDelta] = useState(null); // [S23 T-9] 지역별 이야기 증감(오늘 화면에서 이관)

  // [S23 T-9] 지역별 이야기 건수 오늘치 적립 + 전날 대비 증감(오늘 화면과 같은 소스·스냅샷).
  useEffect(() => {
    cachedJson("/api/story-region-stats")
      .then((d) => { if (d?.ok && d.counts) { recordRegionSnapshot(d.counts); setRegionDelta(getRegionDelta()); } })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const override = getStoryRegionOverride();
    if (override) { setRegion(override); return; }
    cachedJson("/api/pwa/re/complexDongs")
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

      {/* [S29-7] 이번 주 회차 — 없으면 '쉬어갑니다'(빈 카드 금지) */}
      {latestEp ? (
        <section className="card">
          <EpisodeCard ep={latestEp} past={pastEps} onOpenPast={() => setPastOpen((v) => !v)} bare />
          {/* [S29-9] 회차 → 반응 → (YE에서 댓글) 순서 */}
          <EpisodeReactions episode={latestEp.slug} />
          {/* [S29-10] 공유는 공개판(www)으로 — 받는 사람이 로그인 벽을 안 만나게 */}
          <div className="story-share">
            <ShareButton
              title={`${latestEp.title} | ONE-HUB`}
              text={Array.isArray(latestEp.summary) ? latestEp.summary[0] : ""}
              url={`https://www.one-hub.kr/episodes/${latestEp.slug}`}
              label="이 회차 공유"
            />
          </div>
        </section>
      ) : (
        <section className="card"><div className="story-rest">이번 주는 쉬어갑니다 · 아래 <b>지난 이야기</b>를 보세요</div></section>
      )}
      {pastOpen && pastEps.length > 0 && (
        <section className="card">
          <div className="story-rd-h">지난 회차</div>
          {pastEps.map((e) => (<div className="story-past-row" key={e.slug}>{e.date} · {e.title}</div>))}
        </section>
      )}
      {/* [S29-8] 운영자 — 토요일 회차 소재 초안(기존 데이터만·출처 포함) */}
      {isOp && isSat && draft && (
        <section className="card">
          <div className="story-rd-h">📺 이번 주 회차 소재 <span className="story-rd-sub">운영자</span></div>
          {draft.enough ? (
            <>
              {draft.items.map((it, i) => (
                <div className="story-draft-row" key={i}><b>{i + 1}. {it.headline}</b>{it.detail ? <span> — {it.detail}</span> : null}<i className="story-draft-src"> · {it.source}</i></div>
              ))}
              <div className="story-draft-foot">대본 초안 · 예상 {draft.minutes}분 · 숫자는 앱 화면 값 그대로</div>
              <button type="button" className="story-draft-copy" onClick={() => { try { navigator.clipboard.writeText(draft.script); } catch (e) {} }}>대본 초안 복사</button>
            </>
          ) : (
            <div className="story-rest">이번 주는 소재가 충분하지 않습니다({draft.items.length}개) · 판단·차단·신고가가 쌓이면 더 나옵니다.</div>
          )}
        </section>
      )}

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
      {/* [S29-11] 지역 댓글은 회차 아래로 · 제목을 '우리 동네 이야기'로(기대를 낮춘다) ·
          이번 회차가 있으면 그것에 대해 남기도록 유도 */}
      <section className="card">
        <Comments date={region} title="우리 동네 이야기" topic={latestEp ? latestEp.title : ""} />
      </section>
      {/* [S29-7] 이미 만들어 둔 7화 연재를 앱 안에서 연결(놀고 있던 자산) */}
      <section className="card">
        <button type="button" className="story-serial" onClick={() => router.push("/story/01-scattered")}>📖 ONE·HUB는 왜 만들어졌나 · 7화 연재 →</button>
      </section>
      <BottomNav active="story" />
      <style jsx>{`
        .story { max-width: 480px; margin: 0 auto; padding: 0 14px var(--nav-clearance-fab); font-family: var(--font-sans); color: var(--color-ink); min-height: 100vh; background: var(--color-bg); }
        .story-rest { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.6; word-break: keep-all; }
        .story-share { margin-top: 12px; }
        .story-past-row { font-size: var(--fs-2); color: var(--color-ink-2); padding: 6px 0; border-top: 1px solid var(--color-line); }
        .story-draft-row { font-size: var(--fs-2); color: var(--color-ink-2); line-height: 1.6; padding: 6px 0; border-top: 1px solid var(--color-line); word-break: keep-all; }
        .story-draft-row b { color: var(--color-ink); }
        .story-draft-src { color: var(--color-ink-3); font-style: normal; font-size: var(--fs-1); }
        .story-draft-foot { font-size: var(--fs-1); color: var(--color-ink-3); margin-top: 8px; }
        .story-draft-copy { margin-top: 10px; border: 1px solid var(--color-primary); background: var(--color-primary); color: var(--color-on-primary); border-radius: var(--radius-sm); padding: 9px 14px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; }
        .story-serial { width: 100%; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-primary); border-radius: var(--radius-sm); padding: 12px; font-size: var(--fs-3); font-weight: 700; font-family: var(--font-sans); cursor: pointer; text-align: left; }
        /* [사용자 지시] 상위 메뉴 고정 */
        .sticky-hdr { position: sticky; top: 0; z-index: 140; background: var(--color-bg); margin: 0 -14px; padding: 0 14px; }
        .story-title { display: flex; align-items: center; gap: 8px; font-size: var(--fs-6); font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .story-fixed { flex-shrink: 0; }
        .story-rd-h { font-size: var(--fs-4); font-weight: 800; color: var(--color-ink); margin-bottom: 8px; }
        .story-rd-sub { font-size: var(--fs-1); font-weight: 600; color: var(--color-ink-3); margin-left: 6px; }
        .story-rd-list { display: flex; flex-direction: column; gap: 5px; }
        .story-rd-row { display: flex; align-items: center; gap: 8px; font-size: var(--fs-3); }
        .story-rd-nick { color: var(--color-ink-2); font-weight: 700; }
        .story-rd-cnt { color: var(--color-ink-3); }
        .story-rd-up { margin-left: auto; color: var(--color-danger, #dc2626); font-weight: 700; }
        .story-rd-down { margin-left: auto; color: var(--color-primary); font-weight: 700; }
        .story-region { color: var(--color-primary); }
        .story-sub-inline { font-size: var(--fs-2); font-weight: 600; color: var(--color-ink-3); }
        .story-change { margin-left: auto; flex-shrink: 0; border: 1px solid var(--color-line); background: var(--color-card); color: var(--color-ink-2); font-size: var(--fs-2); font-weight: 700; padding: 6px 12px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-card, 14px); padding: 16px; margin-bottom: 12px; box-shadow: var(--shadow-card); }
        .story-picker-h { font-size: var(--fs-2); font-weight: 800; color: var(--color-ink-2); margin-bottom: 10px; }
        .story-picker-h2 { margin-top: 14px; padding-top: 12px; border-top: 1px dashed var(--color-line); }
        .story-picker-list { display: flex; flex-wrap: wrap; gap: 8px; }
        .story-chip { border: 1px solid var(--color-line); background: var(--color-card-soft); color: var(--color-ink-2); font-size: var(--fs-2); font-weight: 700; padding: 7px 13px; border-radius: 999px; cursor: pointer; font-family: var(--font-sans); }
        .story-chip.on { background: var(--color-primary); border-color: var(--color-primary); color: var(--color-on-primary); }
      `}</style>
      <style jsx global>{`body { background: var(--color-bg); margin: 0; }`}</style>
    </div>
  );
}

// [S29-7] 회차는 content/episodes/*.md — content/weekly 와 같은 마크다운+getStaticProps 패턴(새 발행 체계 아님).
export async function getStaticProps() {
  const fs = require("fs");
  const path = require("path");
  const matter = require("gray-matter");
  const dir = path.join(process.cwd(), "content", "episodes");
  let episodes = [];
  try {
    if (fs.existsSync(dir)) {
      episodes = fs.readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .sort().reverse()
        .map((f) => {
          const { data } = matter(fs.readFileSync(path.join(dir, f), "utf8"));
          return {
            slug: f.replace(/\.md$/, ""), title: data.title || f, date: data.date || "",
            week: data.week || "", youtube_id: data.youtube_id || "", duration: data.duration || "",
            summary: Array.isArray(data.summary) ? data.summary : [], figures: Array.isArray(data.figures) ? data.figures : [],
            published: data.published !== false,
          };
        })
        .filter((e) => e.published);
    }
  } catch (e) { episodes = []; }
  return { props: { episodes } };
}
