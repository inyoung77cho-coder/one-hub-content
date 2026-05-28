# signal_validator.py — ONE-HUB v5.3
# ============================================================
# v5.3 수익 개선사항:
#   [P5] calc_regime_adjusted_threshold() 연동
#        VIX 연동 동적 점수 기준 적용 (strategy.py에서 가져옴)
#        기존: SIDEWAYS 62 / BULL 60 하드코딩
#        수정: vix 값에 따라 58~68 동적 결정
#
#   [P2] GAP_BLOCKED 에러 코드 추가
#        갭 필터로 차단된 종목에 대한 명확한 이유 표시
#
#   신규: format_gap_msg() — 갭 차단 시 내일 재진입 가이드 메시지
# ============================================================

from strategy import calc_regime_adjusted_threshold


def _target_error_type(price, target):
    if price <= 0: return "INVALID_PRICE"
    if target <= 0: return "INVALID_TARGET"
    gap_pct = (target / price - 1) * 100
    if gap_pct < -50: return "TARGET_DATA_MISMATCH"
    elif gap_pct < -10: return "TARGET_TOO_LOW"
    elif gap_pct <= 0: return "TARGET_WEAK_UPSIDE"
    return None


def validate_signal(stock, vix: float = 18.0):
    """
    [P5] vix 파라미터 추가 — 동적 기준 점수 사용.
    기존: min_valid = 62 if SIDEWAYS else 60 하드코딩
    수정: calc_regime_adjusted_threshold(regime, vix) 호출

    호출 시 main.py에서 last_vix를 넘겨야 함:
      is_valid, errors = validate_signal(p, vix=last_vix)
    """
    price       = stock.get("price", 0)
    target      = stock.get("target", 0)
    stop        = stock.get("stop_loss", 0)
    ml_signal   = str(stock.get("ml_signal", "HOLD")).upper()
    final_score = stock.get("final_score", 0)
    tech_score  = stock.get("tech_score", 0)
    macro_score = stock.get("macro_score", 50)
    ai_score    = stock.get("ai_score", 50)
    rsi         = stock.get("rsi", 50)
    vol_ratio   = stock.get("vol_ratio", 1.0)
    regime      = str(stock.get("regime", "SIDEWAYS")).upper()

    errors = []

    if regime == "BEAR":
        errors.append("REGIME_BEAR")

    if price <= 0:
        errors.append("INVALID_PRICE")

    target_err = _target_error_type(price, target)
    if target_err:
        errors.append(target_err)

    if stop <= 0:
        errors.append("INVALID_STOP")
    elif stop >= price:
        errors.append("STOP_ABOVE_PRICE")

    if ml_signal in ("SELL", "STRONG_SELL"):
        errors.append("ML_" + ml_signal)

    # [P5] VIX 연동 동적 기준
    min_valid, min_watchlist = calc_regime_adjusted_threshold(regime, vix)

    if final_score < min_watchlist:
        if tech_score < 45:
            errors.append("LOW_TECH_SCORE")
        elif ai_score < 50:
            errors.append("LOW_ML_SCORE")
        elif macro_score < 50:
            errors.append("LOW_MACRO_SCORE")
        elif vol_ratio < 0.8:
            errors.append("LOW_VOLUME")
        elif not stock.get("ma_cross", False) and rsi > 60:
            errors.append("LOW_TREND")
        else:
            errors.append("LOW_SCORE")

    elif final_score < min_valid:
        errors.append("WATCHLIST_SCORE")

    if rsi > 75:
        errors.append("RSI_OVERBOUGHT")

    price_v  = stock.get("price", 0)
    target_v = stock.get("target", 0)
    stop_v   = stock.get("stop_loss", 0)
    if price_v > 0 and target_v > price_v and stop_v > 0 and stop_v < price_v:
        upside   = target_v - price_v
        downside = price_v - stop_v
        rr_ratio = upside / downside if downside > 0 else 0
        min_rr   = 1.3 if regime == "SIDEWAYS" else 1.0
        if rr_ratio < min_rr:
            errors.append("LOW_RR_RATIO")

    return len(errors) == 0, errors


def _gap_pct(price, target):
    if price <= 0: return 0.0
    return round((target / price - 1) * 100, 1)

def _upside_pct(price, target):
    if price <= 0 or target <= price: return 0.0
    return round((target / price - 1) * 100, 1)

def _downside_pct(price, stop):
    if price <= 0 or stop <= 0: return 0.0
    return round((price - stop) / price * 100, 1)

def _calc_rr(stock):
    price  = stock.get("price", 0)
    target = stock.get("target", 0)
    stop   = stock.get("stop_loss", 0)
    if price > 0 and target > price and stop > 0 and stop < price:
        return (target - price) / (price - stop)
    return 0.0


_ERROR_KO = {
    "REGIME_BEAR":           "BEAR 레짐 — 신규 매수 금지",
    "INVALID_PRICE":         "현재가 데이터 오류 (0 또는 음수)",
    "INVALID_TARGET":        "목표가 데이터 없음 (0)",
    "TARGET_DATA_MISMATCH":  "목표가가 현재가 대비 50% 이상 낮음 → 데이터 소스/단위 불일치 의심",
    "TARGET_TOO_LOW":        "목표가가 현재가 대비 10~50% 낮음 → 목표가 계산 오류",
    "TARGET_WEAK_UPSIDE":    "목표가가 현재가와 같거나 낮음 → 상승 여력 없음",
    "INVALID_STOP":          "손절가 데이터 없음 (0)",
    "STOP_ABOVE_PRICE":      "손절가가 현재가 이상 → 손절 설정 오류",
    "ML_SELL":               "ML 신호 SELL — 하락 가능성",
    "ML_STRONG_SELL":        "ML 신호 STRONG_SELL — 강한 하락 가능성",
    "LOW_SCORE":             "종합 점수 미달",
    "LOW_TECH_SCORE":        "기술적 점수 부족 (MA/RSI/볼린저 조건 미충족)",
    "LOW_ML_SCORE":          "ML 확신도 낮음 — AI 매수 신호 약함",
    "LOW_MACRO_SCORE":       "매크로 환경 비우호적 (VIX/나스닥/달러 조건 미흡)",
    "LOW_VOLUME":            "거래량 부족 (vol_ratio < 0.8) — 수급 불량",
    "LOW_TREND":             "추세 부재 — 골든크로스 없음 + RSI 과열",
    "WATCHLIST_SCORE":       "점수 기준 미달 — 관찰 후보 (매수 보류)",
    "WATCHLIST_RR":          "손익비 관찰 수준 — 관찰 후보 (매수 보류)",
    "RSI_OVERBOUGHT":        "RSI 75 초과 — 과열 구간 신규 진입 금지",
    "LOW_RR_RATIO":          "손익비 부족 — SIDEWAYS 1.3 / BULL 1.0 미달",
    "GAP_BLOCKED":           "갭상승 차단 — 전일 대비 +3% 이상 갭으로 추격매수 금지",  # [P2]
}

_ACTION_KO = {
    "TARGET_DATA_MISMATCH":  "가격 데이터 소스 점검 필요 (KIS vs yfinance 단위 확인)",
    "TARGET_TOO_LOW":        "목표가 계산식 점검 필요",
    "TARGET_WEAK_UPSIDE":    "목표가 재설정 후 재분석",
    "ML_SELL":               "ML 분석 신뢰 — 매수 금지, 다음 분석까지 관망",
    "ML_STRONG_SELL":        "ML 분석 신뢰 — 매수 금지, 다음 분석까지 관망",
    "REGIME_BEAR":           "레짐 전환까지 현금 보유",
    "RSI_OVERBOUGHT":        "RSI 70 이하 조정 후 재진입 검토",
    "LOW_TECH_SCORE":        "MA 배열, RSI 30~50 구간, 거래량 개선 후 재검토",
    "LOW_ML_SCORE":          "ML 확신도 60+ 이상 될 때까지 대기",
    "LOW_MACRO_SCORE":       "매크로 환경 개선(VIX↓, 나스닥↑) 후 재진입 검토",
    "LOW_VOLUME":            "거래량 평균 이상 회복 시 재후보",
    "LOW_TREND":             "골든크로스 형성 후 재분석",
    "LOW_SCORE":             "점수 개선 시 재후보 등재 가능",
    "WATCHLIST_SCORE":       "다음 분석에서 점수 상승 시 VALID 전환 가능",
    "LOW_RR_RATIO":          "목표가 조정 또는 손절 여유 확대 시 재검토",
    "GAP_BLOCKED":           "장 초반 안정 확인 후 /analyze 재실행 → 갭 소화되면 VALID 전환",
}

WATCHLIST_ERRORS = {"WATCHLIST_SCORE", "WATCHLIST_RR"}
HARD_ERRORS = {
    "REGIME_BEAR", "INVALID_PRICE", "INVALID_TARGET",
    "TARGET_DATA_MISMATCH", "TARGET_TOO_LOW", "TARGET_WEAK_UPSIDE",
    "INVALID_STOP", "STOP_ABOVE_PRICE",
    "ML_SELL", "ML_STRONG_SELL",
    "LOW_SCORE", "LOW_TECH_SCORE", "LOW_ML_SCORE", "LOW_MACRO_SCORE",
    "LOW_VOLUME", "LOW_TREND",
    "RSI_OVERBOUGHT", "LOW_RR_RATIO",
    "GAP_BLOCKED",
}


def classify_stock(stock, vix: float = 18.0):
    """[P5] vix 파라미터 추가."""
    _, errors   = validate_signal(stock, vix=vix)
    hard        = [e for e in errors if e in HARD_ERRORS]
    watch       = [e for e in errors if e in WATCHLIST_ERRORS]
    data_errs   = [e for e in errors if e in (
        "INVALID_PRICE","INVALID_TARGET","TARGET_DATA_MISMATCH",
        "TARGET_TOO_LOW","TARGET_WEAK_UPSIDE","INVALID_STOP","STOP_ABOVE_PRICE"
    )]

    regime      = str(stock.get("regime", "?"))
    final_score = stock.get("final_score", 0)
    vix_        = stock.get("vix", vix)
    min_valid, _ = calc_regime_adjusted_threshold(regime.upper(), vix_)

    if data_errs:
        return "ERROR", errors, "데이터 오류: " + " / ".join(data_errs)
    if hard:
        return "BLOCKED", errors, " / ".join(hard)
    if watch:
        gap = round(min_valid - final_score, 1)
        main_watch = watch[0]
        if main_watch == "WATCHLIST_SCORE":
            reason = (
                f"Score {final_score} / 기준 {min_valid} ({gap:+.1f}점 부족)"
                f" | ML:{stock.get('ml_signal','?')}"
            )
        else:
            rr = _calc_rr(stock)
            reason = f"손익비 {rr:.2f} / 기준 1.3 ({1.3-rr:+.2f} 부족)"
        return "WATCHLIST", errors, reason

    return "VALID", [], ""


# ── [P2] 갭 차단 메시지 포맷 ─────────────────────────────
def format_gap_msg(stock, gap_pct: float) -> str:
    """갭 필터로 차단된 종목에 대한 텔레그램 메시지."""
    name  = stock.get("name", "?")
    code  = stock.get("code", "?")
    price = stock.get("price", 0)
    return (
        f"[갭차단] {name}({code})\n"
        f"전일 대비 +{gap_pct:.1f}% 갭상승 → 추격매수 금지\n"
        f"현재가: {format(int(price),',')}원\n"
        "━━━━━━━━━━━━━━━━━━\n"
        "갭 소화 후 재진입 조건:\n"
        "  1. 갭 발생 후 30분~1시간 관망\n"
        "  2. 갭 채움 또는 거래량 감소 확인\n"
        "  3. /analyze 재실행 → 갭 비율 감소 시 자동 VALID 전환"
    )


def format_blocked_msg(stock, errors):
    name   = stock.get("name", "?")
    code   = stock.get("code", "?")
    price  = stock.get("price", 0)
    target = stock.get("target", 0)
    stop   = stock.get("stop_loss", 0)
    gap    = _gap_pct(price, target)
    lines  = [
        f"🚫 {name} ({code})",
        f"❌ AI 판단: 매수 불가",
        f"Price:  {format(int(price), ',')}원",
        f"Target: {format(int(target), ',')}원",
        f"Gap:    {gap:+.1f}%",
        "Reason:",
    ]
    for i, e in enumerate(errors, 1):
        lines.append(f"  {i}. {_ERROR_KO.get(e, e)}")
    lines.append("→ 다음 분석 시 재평가 예정")
    lines.append(f"/why {code}  로 상세 확인")
    return "\n".join(lines)


def format_why_msg(stock, errors):
    name        = stock.get("name", "?")
    code        = stock.get("code", "?")
    price       = stock.get("price", 0)
    target      = stock.get("target", 0)
    stop        = stock.get("stop_loss", 0)
    ml_signal   = stock.get("ml_signal") or "계산중"
    final_score = stock.get("final_score") or 0
    tech_score  = stock.get("tech_score", 0)
    macro_score = stock.get("macro_score", 0)
    ai_score    = stock.get("ai_score", 50)
    rsi         = stock.get("rsi", 0)
    vol_ratio   = stock.get("vol_ratio", 0)
    regime      = stock.get("regime", "?")
    ma_cross    = stock.get("ma_cross", False)
    vix_        = stock.get("vix", 18.0)

    gap_pct = _gap_pct(price, target)
    dn_pct  = _downside_pct(price, stop)
    rr      = _calc_rr(stock)

    min_v, _ = calc_regime_adjusted_threshold(str(regime).upper(), vix_)

    vol_score    = min(vol_ratio * 40, 100)
    tech_contrib = round(tech_score  * 0.35, 1)
    mac_contrib  = round(macro_score * 0.20, 1)
    ai_contrib   = round(ai_score    * 0.35, 1)
    vol_contrib  = round(vol_score   * 0.10, 1)
    calc_total   = round(tech_contrib + mac_contrib + ai_contrib + vol_contrib, 1)

    lines = [
        f"🔍 {name} ({code}) 점수 분해",
        "━━━━━━━━━━━━━━━━━━",
        f"현재가:   {format(int(price), ',')}원",
        f"목표가:   {format(int(target), ',')}원  ({gap_pct:+.1f}%)",
        f"손절가:   {format(int(stop), ',')}원   (-{dn_pct:.1f}%)",
        f"손익비:   {rr:.2f}  (기준: {'1.3' if str(regime).upper() == 'SIDEWAYS' else '1.0'})",
        "━━━━━━━━━━━━━━━━━━",
        f"종합점수: {final_score} / 기준 {min_v}  (차이: {round(final_score-min_v, 1):+.1f}점)",
        f"VIX 기준: {vix_:.1f}  (동적 조정)",  # [P5]
        "",
        "📊 점수 구성요소 분해:",
        f"  기술점수  {tech_score:>5.0f} × 35% = {tech_contrib:>5.1f}점",
        f"  매크로    {macro_score:>5.0f} × 20% = {mac_contrib:>5.1f}점",
        f"  ML점수    {ai_score:>5.0f} × 35% = {ai_contrib:>5.1f}점",
        f"  거래량    {vol_score:>5.0f} × 10% = {vol_contrib:>5.1f}점",
        f"  ──────────────────────",
        f"  합계                   {calc_total:>5.1f}점",
        "",
        f"RSI: {rsi}  |  골든크로스: {'✅' if ma_cross else '❌'}  |  ML: {ml_signal}",
        "━━━━━━━━━━━━━━━━━━",
        "차단 사유:",
    ]

    primary_action = None
    for e in errors:
        desc   = _ERROR_KO.get(e, e)
        action = _ACTION_KO.get(e, "")
        lines.append(f"  ❌ {desc}")
        if action and primary_action is None:
            primary_action = action

    lines.append("")
    lines.append("💡 점수 올리려면:")
    if tech_score < 60:
        diff = round((60 - tech_score) * 0.35, 1)
        lines.append(f"  • 기술점수 {tech_score:.0f}→60 달성 시 +{diff:.1f}점")
    if ai_score < 65:
        diff = round((65 - ai_score) * 0.35, 1)
        lines.append(f"  • ML점수 {ai_score:.0f}→65 달성 시 +{diff:.1f}점")
    if vol_ratio < 1.2:
        diff = round((1.2 - vol_ratio) * 40 * 0.10, 1)
        lines.append(f"  • 거래량비율 {vol_ratio}→1.2x 개선 시 +{diff:.1f}점")
    if primary_action:
        lines.append(f"  • {primary_action}")

    return "\n".join(lines)


def format_watchlist_msg(stock, reason):
    name   = stock.get("name", "?")
    code   = stock.get("code", "?")
    price  = stock.get("price", 0)
    score  = stock.get("final_score") or 0
    ml     = stock.get("ml_signal") or "계산중"
    rsi    = stock.get("rsi", 0)
    vol    = stock.get("vol_ratio", 0)
    regime = stock.get("regime", "?")
    return (
        f"👀 {name} ({code}) — WATCHLIST\n"
        f"현재가: {format(int(price), ',')}원\n"
        f"점수:   {score}/100 | {reason}\n"
        f"ML:     {ml} | RSI: {rsi} | 거래량: {vol}x\n"
        f"레짐:   {regime}\n"
        f"→ 매수 보류. 다음 분석에서 재검토"
    )


def format_valid_msg(stock, regime_emoji=""):
    name        = stock.get("name", "?")
    code        = stock.get("code", "?")
    price       = stock.get("price", 0)
    target      = stock.get("target", 0)
    stop        = stock.get("stop_loss", 0)
    rsi         = stock.get("rsi", 50)
    vol_ratio   = stock.get("vol_ratio", 1)
    ml_signal   = stock.get("ml_signal", "HOLD")
    final_score = stock.get("final_score") or 0
    theme       = stock.get("theme", "")
    reason      = stock.get("reason", "")
    regime      = stock.get("regime", "SIDEWAYS")
    upside_pct  = _upside_pct(price, target)
    risk_pct    = _downside_pct(price, stop)
    rr          = _calc_rr(stock)
    msg  = f"📈 {name} ({code})\n"
    msg += f"현재가:  {format(int(price), ',')}원\n"
    msg += f"목표가:  {format(int(target), ',')}원 (+{upside_pct}%)\n"
    msg += f"손절가:  {format(int(stop), ',')}원 (-{risk_pct}%)\n"
    msg += f"손익비:  {rr:.2f}\n"
    msg += f"ML신호:  {ml_signal} | RSI: {rsi} | 거래량: {vol_ratio}x\n"
    msg += f"테마:    {theme}\n"
    msg += f"근거:    {reason}\n"
    msg += f"점수:    {round(final_score, 1)}/100 | [{regime}] {regime_emoji}\n"
    msg += f"/buy {code}   /skip {code}"
    return msg
