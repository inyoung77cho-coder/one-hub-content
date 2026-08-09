// [사용자 지시 2026-08-09] "종합자산 자산지도" 타이틀 바 — assets.js뿐 아니라 direct 연결되는
//   etf.js/realestate.js 자체 페이지 상단에도 동일하게 얹어, 탭을 눌러 다른 페이지로 이동해도
//   "상위 메뉴바"(종합자산 자산지도 + 주식/ETF/부동산 순환)가 계속 보이게 한다.
//   assets.js 자신도 이 컴포넌트를 재사용해 중복 정의로 인한 위치 드리프트를 막는다
//   (참고: memory의 header_position_consistency — 같은 UI를 여러 곳에 손으로 복제하면 어긋난다).
import { useRouter } from "next/router";
import RotatingPageTitle from "./RotatingPageTitle";

const ASSET_MAP_VIEWS = [
  { label: "주식", href: "/pwa/assets" },
  { label: "ETF", href: "/pwa/etf" },
  { label: "부동산", href: "/pwa/realestate" },
];

// current: "주식" | "ETF" | "부동산" — 지금 보고 있는 자산군(순환 라벨의 시작점).
// onChangeView: assets.js처럼 페이지 안에서 뷰 전환이 필요하면 넘긴다(주식일 때만). 없으면 항상 이동.
export default function AssetMapTitle({ current, onChangeView }) {
  const router = useRouter();
  const idx = Math.max(0, ASSET_MAP_VIEWS.findIndex((v) => v.label === current));
  return (
    <div className="amt-title">
      <span className="amt-fixed">종합자산 <span className="amt-sub">자산 지도</span></span>
      <RotatingPageTitle
        compact
        controlledIndex={idx}
        items={ASSET_MAP_VIEWS.map((v) => ({ suffix: v.label }))}
        onChange={(i) => {
          const v = ASSET_MAP_VIEWS[i];
          if (v.label === "주식" && onChangeView) onChangeView(i);
          else router.push(v.href);
        }}
        onLabelClick={(item) => {
          const v = ASSET_MAP_VIEWS.find((x) => x.label === item.suffix);
          if (v) router.push(v.href);
        }}
      />
      <style jsx>{`
        .amt-title { display: flex; align-items: center; gap: 8px; font-size: 20px; font-weight: 800; letter-spacing: -.4px; margin: 6px 2px 14px; }
        .amt-fixed { flex-shrink: 0; color: var(--color-ink); }
        .amt-sub { font-size: 12px; font-weight: 600; color: var(--color-ink-3); }
      `}</style>
    </div>
  );
}
