// [S24-5] 페이지 '안'의 좌우 탭을 스와이프로 전환하는 공용 훅. 세 화면(오늘·종합자산·AI)이 공유한다.
//   ★하단 탭(페이지 간 이동)에는 절대 쓰지 않는다 — 그건 클릭만. 스와이프는 '추가' 수단이지 유일 수단이 아니다.
//   함정 8개를 여기 한 곳에서 처리(페이지마다 복제하면 세 번 틀린다).
import { useRef, useCallback } from "react";

export default function useSwipeTabs({ index, count, onChange, edgeGuard = 24, threshold = 60 }) {
  const st = useRef(null);

  const onTouchStart = useCallback((e) => {
    const t = e.touches && e.touches[0];
    if (!t) { st.current = null; return; }
    // 함정1: 좌측 가장자리 24px 안에서 시작한 터치 = iOS 뒤로가기 → 무시.
    if (t.clientX <= edgeGuard) { st.current = null; return; }
    // 함정2: overflow-x 스크롤 영역(표·칩 행·차트) 안에서 시작 → 무시.
    let el = e.target;
    while (el && el !== e.currentTarget && el.nodeType === 1) {
      try {
        const s = window.getComputedStyle(el);
        if ((s.overflowX === "auto" || s.overflowX === "scroll") && el.scrollWidth > el.clientWidth + 2) { st.current = null; return; }
      } catch (err) {}
      el = el.parentElement;
    }
    st.current = { x: t.clientX, y: t.clientY, decided: null, ts: Date.now() };
  }, [edgeGuard]);

  const onTouchMove = useCallback((e) => {
    const s = st.current;
    if (!s) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = t.clientX - s.x, dy = t.clientY - s.y;
    if (s.decided === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      // 함정3: |dx| > |dy|*1.5 일 때만 스와이프로 확정, 애매하면 세로 스크롤에 양보.
      s.decided = Math.abs(dx) > Math.abs(dy) * 1.5 ? "x" : "y";
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    const s = st.current;
    st.current = null;
    if (!s || s.decided !== "x") return;
    const t = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - s.x;
    const dt = Date.now() - s.ts;
    // 함정4: 60px 이상 또는 빠른 플릭(30px+ · 250ms 미만)일 때만.
    if (Math.abs(dx) < threshold && !(Math.abs(dx) > 30 && dt < 250)) return;
    // 함정5: 양 끝에서 더 밀어도 페이지를 벗어나지 않는다(인덱스 클램프).
    if (dx < 0 && index < count - 1) onChange(index + 1);      // 왼쪽으로 밀기 → 다음 탭
    else if (dx > 0 && index > 0) onChange(index - 1);          // 오른쪽으로 밀기 → 이전 탭
  }, [index, count, onChange, threshold]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
