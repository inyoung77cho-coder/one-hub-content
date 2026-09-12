// [S34-6] 막힌 지점에 거는 사용법 영상 링크 — 카드 안 한 줄. ★미발행(yt 빈칸)이면 아무것도 안 그린다.
//   새 탭·rel=noopener(앱을 떠나게 하지 않음). ?from=app&v=<id> 로 어느 자리가 일하는지 집계.
//   ★팝업·모달 금지. S33 HA 빈상태 '다음 걸음'을 밀어내지 말고 그 아래 한 줄로.
import { videoUrl, videoTitle } from "../lib/videos";

export default function VideoLink({ id, label }) {
  const url = videoUrl(id, "app");
  if (!url) return null; // 미발행 → 빈 링크 금지
  return (
    <a className="vl" href={url} target="_blank" rel="noopener noreferrer">
      <span className="vl-ic" aria-hidden="true">▶</span>
      <span className="vl-t">{label || videoTitle(id)}</span>
      <span className="vl-go">보기 ↗</span>
      <style jsx>{`
        .vl { display: inline-flex; align-items: center; gap: 8px; margin-top: 8px;
          font-size: var(--fs-2, 13px); font-weight: 700; color: var(--color-primary, #2F6BFF);
          text-decoration: none; background: var(--color-primary-soft, #EAF1FF);
          border-radius: var(--radius-pill, 999px); padding: 6px 12px; font-family: var(--font-sans); }
        .vl-ic { font-size: 10px; }
        .vl-go { font-weight: 800; }
      `}</style>
    </a>
  );
}
