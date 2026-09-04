// [S28-7/8] "이번 달 AI가 개선됐나" — 사용자에게 나가는 결과 요약 한 줄의 근거.
//   ★개선이 없으면 null(없는 달에 '개선 중'이라고 쓰면 거짓말이 된다 — S28-7 #3).
//   근거: /api/pwa/accuracy?days=60 의 일별(app_version 태그)에서 '이번 달 버전 전환 + 정확도 상승'.
//   데이터가 하루씩 쌓이므로 초기엔 항상 null(정직).
export async function getEngineImprovement(trader = "A") {
  try {
    const d = await fetch(`/api/pwa/accuracy?trader_id=${trader}&days=60`).then((r) => r.json());
    const daily = (d && d.daily) || [];
    if (daily.length < 2) return null;
    const month = new Date().toISOString().slice(0, 7);
    const inMonth = daily.filter((x) => String(x.date || "").slice(0, 7) === month);
    if (inMonth.length < 2) return null;
    let cut = -1, fromV = null, toV = null;
    for (let i = 1; i < inMonth.length; i++) {
      if (inMonth[i].app_version && inMonth[i].app_version !== inMonth[i - 1].app_version) {
        cut = i; fromV = inMonth[i - 1].app_version; toV = inMonth[i].app_version;
      }
    }
    if (cut < 1) return null;
    const avg = (arr) => {
      const v = arr.map((x) => x.accuracy_pct).filter((x) => x != null);
      return v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null;
    };
    const before = avg(inMonth.slice(0, cut));
    const after = avg(inMonth.slice(cut));
    if (before == null || after == null || after <= before) return null;
    return { improved: true, from_pct: before, to_pct: after, from_ver: fromV, to_ver: toV };
  } catch (e) {
    return null;
  }
}
