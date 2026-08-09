// [사용자 지시] AI 리포트 탭에서 들어가는 상세 리포트 페이지(일간·주간·히스토리·차단정확도·히트
//   히스토리)에도 AI 페이지와 동일한 상위 메뉴(AI vs 나 대결/자기검증/리포트)가 보이도록 —
//   AssetMapTitle과 동일한 패턴. 클릭 시 index.js의 해당 섹션(?sec=)으로 이동한다.
import { useRouter } from "next/router";
import RotatingPageTitle from "./RotatingPageTitle";

const AI_TABS = [
  { key: "vs", suffix: "vs 나 대결" },
  { key: "verify", suffix: "자기검증" },
  { key: "archive", suffix: "리포트" },
];

export default function AiTabTitle({ current = "archive" }) {
  const router = useRouter();
  const idx = Math.max(0, AI_TABS.findIndex((t) => t.key === current));
  const go = (key) => router.push(`/pwa?tab=report&sec=${key}`);
  return (
    <RotatingPageTitle
      compact
      fixed="AI"
      mutedSuffix
      spaced
      buttonLabel="분석변경"
      controlledIndex={idx}
      items={AI_TABS.map((t) => ({ suffix: t.suffix }))}
      onChange={(i) => go(AI_TABS[i].key)}
      onLabelClick={(item) => {
        const t = AI_TABS.find((x) => x.suffix === item.suffix);
        if (t) go(t.key);
      }}
    />
  );
}
