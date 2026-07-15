// [G4] 입력값 합리성 검증 — 단일 소스. 자산 입력 폼(StockForm·ReForm)이 저장 직전에 호출한다.
//   목적(S8 신뢰 복구): '틀린 숫자'가 원장(localStorage/온보딩 합산)에 들어가 잘못된 총자산·평가손익으로
//   번지는 것을 입력 단계에서 막는다. 예) 매수가 15.2(억)을 1520으로 오입력 → 평가손익 -99% 쓰레기값.
//   계약: { ok, error?, warn? }
//     - error: 저장 차단(사용자에게 사유 표시)
//     - warn : 저장은 허용하되 확인 문구 표시(오입력 가능성이 높지만 정상일 수도 있는 값)

// 주식 직접입력 검증 — 수량·평단 필수, 현재가(closePrice) 대비 ±10배 이탈은 단위 오입력으로 간주해 차단.
export function validateStockInput({ shares, price, closePrice, ccy = "KRW" }) {
  const q = Number(shares);
  const p = Number(price);
  const c = Number(closePrice);
  const unit = ccy === "USD" ? "$" : "원";
  if (!(q > 0)) return { ok: false, error: "수량을 입력하세요." };
  if (!(p > 0)) return { ok: false, error: `평단가(${unit})를 입력하세요.` };
  if (c > 0) {
    if (p > c * 10) return { ok: false, error: `평단이 현재가 ${c.toLocaleString()}${ccy === "USD" ? "" : "원"}의 10배를 초과합니다 — 총 매수금액을 넣으신 건 아닌가요?` };
    if (p < c / 10) return { ok: false, error: "평단이 현재가의 1/10 미만입니다 — 단위(원/주당)를 확인하세요." };
  }
  return { ok: true };
}

// 부동산 내 단지 검증 — 단지명 필수, 매수가(억)는 억 단위 범위 검증(단위 오입력 방어).
//   0~100억: 통과 / 100~500억: 경고(확인 후 저장) / 500억 초과: 차단.
export function validateRealtyInput({ name, buyUk, pyeong }) {
  const nm = String(name || "").trim();
  if (!nm) return { ok: false, error: "단지명을 입력하세요." };
  const hasUk = buyUk !== "" && buyUk != null;
  if (hasUk) {
    const uk = Number(buyUk);
    if (!(uk >= 0) || Number.isNaN(uk)) return { ok: false, error: "매수가(억)는 0 이상의 숫자로 입력하세요." };
    if (uk > 500) return { ok: false, error: `매수가 ${uk}억은 입력 범위를 벗어납니다 — 억 단위로 입력했는지 확인하세요(예: 15.2).` };
    if (uk > 100) return { ok: true, warn: `매수가 ${uk}억이 맞나요? 억 단위 입력인지 확인해 주세요.` };
  }
  const hasPy = pyeong !== "" && pyeong != null;
  if (hasPy) {
    const py = Number(pyeong);
    if (py > 0 && py > 300) return { ok: true, warn: "평형 값이 큽니다 — 전용㎡ 기준인지 확인해 주세요." };
  }
  return { ok: true };
}
