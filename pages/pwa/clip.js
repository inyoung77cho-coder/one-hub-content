// [S25-10] 오늘 브리핑 전체 듣기 — 각 페이지 내용을 한 클립으로. 대본은 화면과 같은 값(같은 libs).
//   재생기는 AudioPlaylist(다음 한 편만 preload·MediaSession·이어듣기). 자동재생 없음(버튼 탭).
import { useState, useEffect } from "react";
import AppHeader from "../../components/AppHeader";
import BottomNav from "../../components/BottomNav";
import AudioPlaylist from "../../components/shared/AudioPlaylist";
import { getTrader } from "../../lib/trader";
import { getLedger } from "../../lib/ledger";
import { getVerdictScorecard } from "../../lib/verdictStats";
import { briefingScript } from "../../lib/briefingScript";
import { getTargetClass, computeClassDrift, topDriftMessage } from "../../lib/targetClass";
import { buildDailyClip, clipMinutes } from "../../lib/dailyClip";

export default function ClipPage() {
  const [clip, setClip] = useState(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const tr = (() => { try { return getTrader(); } catch (e) { return "A"; } })();
      const L = await getLedger(tr).catch(() => null);
      const bd = (L && L.breakdown) || {};
      const residenceUk = bd.residence_uk != null ? Number(bd.residence_uk) : null;
      const hasResidence = residenceUk != null && residenceUk > 0.005;
      const headUk = hasResidence ? (bd.operating_uk != null ? Number(bd.operating_uk) : (L && L.total_uk)) : (L && L.total_uk != null ? Number(L.total_uk) : null);
      const dd = new Date();
      const summary = briefingScript({ dateLabel: `${dd.getMonth() + 1}월 ${dd.getDate()}일`, headUk, hasResidence, deltaUk: null, todoCount: 0, positionCount: 0 });

      let verdict = "";
      try { const sc = getVerdictScorecard(tr, { days: 7 }); if (sc && sc.total > 0) verdict = `지난주 내 판단은 ${sc.total}건입니다${sc.winRate != null ? `, 승률은 ${sc.winRate}퍼센트` : ""}. AI 평균 수익은 ${sc.aiRet >= 0 ? "" : "마이너스 "}${Math.abs(sc.aiRet).toFixed(1)}퍼센트였습니다.`; } catch (e) {}

      let asset = "";
      try {
        const opClass = { stock: bd.stock_uk || 0, etf: bd.etf_uk || 0, realestate: Math.max(0, (bd.realestate_uk || 0) - (residenceUk || 0)), cash: bd.cash_uk || 0 };
        const msg = topDriftMessage(computeClassDrift(opClass, getTargetClass()));
        if (msg && msg.tone === "warn") asset = msg.text + ".";
      } catch (e) {}

      let realestate = "";
      try {
        const isMon = ((new Date(Date.now() + 9 * 3600000).getUTCDay() + 6) % 7) === 0;
        const rw = JSON.parse(localStorage.getItem("onehub_re_weekly") || "null");
        if (isMon && rw) { const parts = []; if (rw.trades != null) parts.push(rw.trades > 0 ? `내 지역 지난주 실거래는 ${rw.trades}건` : "내 지역 지난주 실거래는 없었습니다"); if (rw.leader) parts.push(`대장 단지는 ${rw.leader}`); realestate = parts.join(", ") + "."; }
      } catch (e) {}

      let news = "";
      try { const d = await fetch("/api/pwa-today-news-brief").then((r) => r.json()); if (d && d.ok && d.brief) news = String(d.brief).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 400); } catch (e) {}

      let foreignItems = [];
      try { const d = await fetch("/api/english/today?medium=news&language=en").then((r) => r.json()); foreignItems = (d?.items || []).filter((l) => l && l.id && l.has_audio !== false).slice(0, 4).map((l) => ({ title: l.title || l.headline || "오늘 학습", src: `/api/english/audio/${l.id}` })); } catch (e) {}

      const c = buildDailyClip({ summary, verdict, asset, realestate, news, foreignItems });
      if (alive) { setClip(c); setDone(true); }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <div className="cl-wrap">
      <AppHeader />
      <main className="cl-main">
        <h1 className="cl-title">🎧 오늘 브리핑 전체 듣기</h1>
        {!done ? (
          <div className="cl-card"><p className="cl-q">대본을 모으는 중…</p></div>
        ) : !clip || clip.count === 0 ? (
          <div className="cl-card"><p className="cl-q">오늘은 들려드릴 내용이 아직 없어요. 판단을 남기거나 오늘 학습을 들으면 트랙이 생깁니다.</p></div>
        ) : (
          <>
            <p className="cl-lead">오늘은 <b>{clip.count}트랙 · 약 {clipMinutes(clip.totalSec)}분</b>. 화면에서 보이는 값 그대로 읽어드립니다. 한 편이 끝나면 다음으로 넘어가고, 트랙을 눌러 건너뛸 수 있어요.</p>
            <AudioPlaylist items={clip.tracks} storageKey="onehub_clip_pos" title={`오늘의 클립 · ${clip.count}트랙`} />
          </>
        )}
      </main>
      <BottomNav />
      <style jsx>{`
        .cl-wrap { min-height: 100vh; background: var(--color-bg); padding-bottom: var(--nav-clearance-fab); }
        .cl-main { max-width: 560px; margin: 0 auto; padding: 12px 14px 40px; }
        .cl-title { font-size: var(--fs-6); font-weight: 800; color: var(--color-ink); margin: 6px 0 6px; }
        .cl-lead { font-size: var(--fs-3); color: var(--color-ink-2); line-height: 1.55; margin: 0 0 12px; word-break: keep-all; }
        .cl-card { background: var(--color-card); border: 1px solid var(--color-line); border-radius: var(--radius-md); padding: 16px; }
        .cl-q { font-size: var(--fs-3); color: var(--color-ink-2); margin: 0; }
      `}</style>
    </div>
  );
}
