// scripts/overflow-check.js — [S35-6] 넘침/잘림 측정기. 브라우저 콘솔에 붙여넣어 쓴다(프로덕션 확인용).
//   큰 글씨 흉내: document.documentElement.style.fontSize='22px'  (되돌리기 = '')
//   페이지폭 > 화면폭 이면 화면이 옆으로 밀린 것. 넘침=상자 밖으로 나감, 잘림=내용이 상자보다 넓음.
(() => {
  const W = document.documentElement.clientWidth, over = [], clip = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return;
    if (r.right - W > 1) {
      const p = el.parentElement, pr = p && p.getBoundingClientRect();
      if (!(pr && pr.right - W > 1)) over.push([el, Math.round(r.right - W) + 'px']);
    }
    if (el.scrollWidth - el.clientWidth > 1 && !el.children.length && el.textContent.trim())
      clip.push([el, el.clientWidth + '→' + el.scrollWidth]);
  });
  console.log('페이지폭', document.documentElement.scrollWidth, '/ 화면폭', W);
  console.table(over.map(([e, o]) => ({ 넘침: o, 클래스: e.className, 내용: e.textContent.trim().slice(0, 30) })));
  console.table(clip.map(([e, o]) => ({ 잘림: o, 클래스: e.className, 내용: e.textContent.trim().slice(0, 30) })));
})();
