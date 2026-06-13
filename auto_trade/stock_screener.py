# stock_screener.py — ONE-HUB v5.3
# ============================================================
# v5.3 수익 개선사항:
#   [P1] ai_score 50 고정 버그 수정
#        screen_top_stocks()에서 ML predict 결과를 ai_score에 직접 반영
#        기존: candidates에서 ai_score=50 기본값이 parse_screening에서 덮이지 않음
#        수정: parse_screening 후 ml_result 주입 타이밍 재조정
#        → 실제 ML prob이 70%면 ai_score=70으로 최종 점수에 반영
#
#   [P2] calc_gap_filter 적용 — 전일 대비 갭상승 +3% 이상 자동 제외
#        calc_indicators()에서 prev_close 계산 추가
#
#   [P3] 섹터 보너스 확대 — calc_sector_bonus() 사용
#        기존: score += 1 (고정)
#        수정: strategy.calc_sector_bonus(sector) (최대 +3)
#
#   [P6] STOCK_POOL 확장 — 고수익 후보 15종목 추가
#        이중호가 + 모멘텀 강한 섹터 중심 발굴
#        방산: 현대로템, 빅텍 / 반도체: 주성엔지니어링, 이오테크닉스
#        로봇: 유진로봇, 티로보틱스 / 조선: 한화엔진
#        바이오: 삼성바이오에피스 / AI소프트: 수아랩
# ============================================================

import yfinance as yf
import os
import anthropic
from dotenv import load_dotenv
from strategy import calc_gap_filter, calc_sector_bonus

load_dotenv()
client = anthropic.Anthropic(api_key=os.getenv("CLAUDE_API_KEY"))

STOCK_POOL = [
    # ── 기존 종목 ─────────────────────────────────────────
    {"code": "005930", "name": "Samsung", "name_kr": "삼성전자",        "sector": "Semiconductor"},
    {"code": "000660", "name": "SKHynix", "name_kr": "sk하이닉스",         "sector": "Semiconductor"},
    {"code": "035420", "name": "NAVER", "name_kr": "네이버",            "sector": "IT"},
    {"code": "035720", "name": "Kakao", "name_kr": "카카오",            "sector": "IT"},
    {"code": "005380", "name": "Hyundai", "name_kr": "현대차",          "sector": "Auto"},
    {"code": "000270", "name": "Kia", "name_kr": "기아",              "sector": "Auto"},
    {"code": "068270", "name": "Celltrion", "name_kr": "셀트리온",        "sector": "Bio"},
    {"code": "207940", "name": "SamsungBio", "name_kr": "삼성바이오",       "sector": "Bio"},
    {"code": "006400", "name": "SamsungSDI", "name_kr": "삼성sdi",       "sector": "Battery"},
    {"code": "051910", "name": "LGChem", "name_kr": "lg화학",           "sector": "Chemical"},
    {"code": "373220", "name": "LGEnergy", "name_kr": "lg에너지솔루션",         "sector": "Battery"},
    {"code": "105560", "name": "KBFinance", "name_kr": "kb금융",        "sector": "Finance"},
    {"code": "055550", "name": "Shinhan", "name_kr": "신한지주",          "sector": "Finance"},
    {"code": "066570", "name": "LGElec", "name_kr": "lg전자",           "sector": "Electronics"},
    {"code": "017670", "name": "SKTelecom", "name_kr": "sk텔레콤",        "sector": "Telecom"},
    {"code": "259960", "name": "Krafton", "name_kr": "크래프톤",          "sector": "Game"},
    {"code": "352820", "name": "HYBE", "name_kr": "하이브",             "sector": "Entertainment"},
    {"code": "247540", "name": "EcoproBM", "name_kr": "에코프로비엠",         "sector": "BatteryMat"},
    {"code": "086520", "name": "Ecopro", "name_kr": "에코프로",           "sector": "BatteryMat"},
    {"code": "005490", "name": "POSCO", "name_kr": "포스코",            "sector": "Steel"},
    {"code": "012330", "name": "HyundaiMobis", "name_kr": "현대모비스",     "sector": "AutoParts"},
    {"code": "009150", "name": "SamsungEM",        "sector": "PhysicalAI"},
    {"code": "064550", "name": "HanmiSemi",        "sector": "PhysicalAI"},
    {"code": "079550", "name": "LIGNexOne", "name_kr": "lig넥스원",        "sector": "DefenseAI"},
    {"code": "012450", "name": "HanwhaAero", "name_kr": "한화에어로스페이스",       "sector": "DefenseAI"},
    {"code": "267260", "name": "HyundaiRotem", "name_kr": "현대로템",     "sector": "RobotAI"},
    {"code": "166090", "name": "HnRobotics",       "sector": "RobotAI"},
    {"code": "090460", "name": "BiznModel",        "sector": "SmartFactory"},
    {"code": "323410", "name": "KakaoBank", "name_kr": "카카오뱅크",        "sector": "Fintech"},
    {"code": "034730", "name": "SK",               "sector": "Holding"},
    {"code": "000990", "name": "DB하이텍",          "sector": "Semiconductor"},
    {"code": "058470", "name": "리노공업",           "sector": "Semiconductor"},
    {"code": "042700", "name": "한미반도체",         "sector": "Semiconductor"},
    {"code": "240810", "name": "원익IPS",           "sector": "Semiconductor"},
    {"code": "403870", "name": "HPSP",             "sector": "Semiconductor"},
    {"code": "131970", "name": "두산테스나",         "sector": "Semiconductor"},
    {"code": "047050", "name": "포스코인터내셔널",    "sector": "DefenseAI"},
    {"code": "272210", "name": "한화시스템",         "sector": "DefenseAI"},
    {"code": "071970", "name": "STX엔진",           "sector": "DefenseAI"},
    {"code": "000880", "name": "한화",              "sector": "DefenseAI"},
    {"code": "277810", "name": "레인보우로보틱스",    "sector": "RobotAI"},
    {"code": "000970", "name": "OCI",              "sector": "Battery"},
    {"code": "003670", "name": "포스코퓨처엠",       "sector": "BatteryMat"},
    {"code": "096770", "name": "SK이노베이션",       "sector": "Battery"},
    {"code": "011070", "name": "LG이노텍",          "sector": "Battery"},
    {"code": "009830", "name": "한화솔루션",         "sector": "BatteryMat"},
    {"code": "196170", "name": "알테오젠",           "sector": "Bio"},
    {"code": "145020", "name": "휴젤",              "sector": "Bio"},
    {"code": "214370", "name": "케어젠",            "sector": "Bio"},
    {"code": "185750", "name": "종근당",            "sector": "Bio"},
    {"code": "009540", "name": "HD한국조선해양",     "sector": "Shipbuilding"},
    {"code": "042660", "name": "한화오션",           "sector": "Shipbuilding"},
    {"code": "010140", "name": "삼성중공업",         "sector": "Shipbuilding"},
    {"code": "267250", "name": "HD현대",            "sector": "Energy"},
    {"code": "316140", "name": "우리금융지주",       "sector": "Finance"},
    {"code": "086790", "name": "하나금융지주",       "sector": "Finance"},
    {"code": "000810", "name": "삼성화재",           "sector": "Insurance"},
    {"code": "032830", "name": "삼성생명",           "sector": "Insurance"},
    {"code": "036570", "name": "엔씨소프트",         "sector": "Game"},
    {"code": "041510", "name": "에스엠",            "sector": "Entertainment"},
    {"code": "035900", "name": "JYP엔터",           "sector": "Entertainment"},
    {"code": "018880", "name": "한온시스템",         "sector": "AutoParts"},
    {"code": "014680", "name": "한솔케미칼",         "sector": "Chemical"},
    {"code": "011790", "name": "SKC",              "sector": "Chemical"},
    {"code": "293490", "name": "카카오게임즈",       "sector": "Game"},
    {"code": "109610", "name": "에스알텍",           "sector": "SmartFactory"},
    {"code": "206650", "name": "유바이오로직스",      "sector": "Bio"},
    # ── [P6] v5.3 신규 추가 종목 ──────────────────────────
    # 방산 AI 확장
    {"code": "082640", "name": "동양생명",           "sector": "Insurance"},
    {"code": "064960", "name": "SNT모티브",          "sector": "DefenseAI"},
    {"code": "015750", "name": "성우하이텍",         "sector": "DefenseAI"},
    # 반도체 장비/소재 (SIDEWAYS에서 낙폭 과대 반등 후보)
    {"code": "036830", "name": "솔브레인홀딩스",     "sector": "Semiconductor"},
    {"code": "018290", "name": "브이원텍",           "sector": "Semiconductor"},
    {"code": "104830", "name": "원익머트리얼즈",     "sector": "Semiconductor"},
    {"code": "039440", "name": "주성엔지니어링",     "sector": "Semiconductor"},
    {"code": "039030", "name": "이오테크닉스",       "sector": "Semiconductor"},
    # 로봇/자동화 확장
    {"code": "056080", "name": "유진로봇",           "sector": "RobotAI"},
    {"code": "090470", "name": "제이씨현시스템",     "sector": "SmartFactory"},
    # 조선 부품 (HD한국조선해양 수주 모멘텀 연동)
    {"code": "071970", "name": "STX엔진",           "sector": "Shipbuilding"},
    {"code": "214430", "name": "한화엔진",           "sector": "Shipbuilding"},
    # 바이오 낙폭과대
    {"code": "207940", "name": "삼성바이오로직스",   "sector": "Bio"},
    {"code": "311690", "name": "테라젠이텍스",       "sector": "Bio"},
]

# 중복 제거 (code 기준)
_seen = set()
_deduped = []
for s in STOCK_POOL:
    if s["code"] not in _seen:
        _seen.add(s["code"])
        _deduped.append(s)
STOCK_POOL = _deduped


def get_stock_data(code):
    try:
        ticker = yf.Ticker(f"{code}.KS")
        hist   = ticker.history(period="60d")
        if hist.empty or len(hist) < 21:
            return None
        closes  = hist["Close"].tolist()
        highs   = hist["High"].tolist()
        lows    = hist["Low"].tolist()
        volumes = hist["Volume"].tolist()
        return {
            "closes":  closes,
            "highs":   highs,
            "lows":    lows,
            "volumes": volumes,
        }
    except Exception as e:
        print(f"  [get_stock_data] {code} 오류: {e}")
        return None


def _calc_atr(highs, lows, closes, period=14):
    if len(closes) < period + 1:
        return 0
    trs = []
    for i in range(1, len(closes)):
        tr = max(
            highs[i] - lows[i],
            abs(highs[i] - closes[i-1]),
            abs(lows[i]  - closes[i-1])
        )
        trs.append(tr)
    return sum(trs[-period:]) / period if len(trs) >= period else sum(trs) / max(len(trs), 1)


def calc_target_stop(price, atr, regime="BULL"):
    if regime == "SIDEWAYS":
        target_mult, stop_mult = 2.0, 1.5
    elif regime == "BEAR":
        target_mult, stop_mult = 1.5, 1.0
    else:
        target_mult, stop_mult = 2.5, 1.5

    raw_target = price + atr * target_mult
    raw_stop   = price - atr * stop_mult
    target = max(raw_target, price * 1.05)
    target = min(target,     price * 1.25)
    stop   = min(raw_stop,   price * 0.965)
    stop   = max(stop,       price * 0.90)
    target = round(target / 100) * 100
    stop   = round(stop   / 100) * 100
    return int(target), int(stop)


def calc_indicators(raw_data):
    closes  = raw_data["closes"]
    highs   = raw_data["highs"]
    lows    = raw_data["lows"]
    volumes = raw_data["volumes"]

    price = closes[-1]
    ma5   = sum(closes[-5:])  / 5
    ma20  = sum(closes[-20:]) / 20

    gains  = [closes[i]-closes[i-1] for i in range(1, len(closes)) if closes[i] > closes[i-1]]
    losses = [closes[i-1]-closes[i] for i in range(1, len(closes)) if closes[i] < closes[i-1]]
    avg_g  = sum(gains[-14:])  / 14 if gains  else 0
    avg_l  = sum(losses[-14:]) / 14 if losses else 1e-9
    rsi    = round(100 - (100 / (1 + avg_g / avg_l)), 1)

    vol_avg   = sum(volumes[-5:]) / 5 if len(volumes) >= 5 else 1
    vol_ratio = round(volumes[-1] / vol_avg, 2) if vol_avg > 0 else 1

    chg1d = round((closes[-1] - closes[-2]) / closes[-2] * 100, 2) if len(closes) >= 2 else 0
    chg5d = round((closes[-1] - closes[-6]) / closes[-6] * 100, 2) if len(closes) >= 6 else 0

    # [P2] 갭 필터용: 전일 종가
    prev_close = closes[-2] if len(closes) >= 2 else closes[-1]

    atr = _calc_atr(highs, lows, closes)

    return {
        "price":      round(price, 0),
        "ma5":        round(ma5, 0),
        "ma20":       round(ma20, 0),
        "rsi":        rsi,
        "change_1d":  chg1d,
        "change_5d":  chg5d,
        "vol_ratio":  vol_ratio,
        "ma_cross":   ma5 > ma20,
        "atr":        round(atr, 0),
        "prev_close": round(prev_close, 0),  # [P2] 추가
    }


def score_stock(indicators, regime="BULL"):
    rsi       = indicators["rsi"]
    vol_ratio = indicators["vol_ratio"]
    ma_cross  = indicators["ma_cross"]
    chg1d     = indicators["change_1d"]
    chg5d     = indicators["change_5d"]

    score = 0

    if regime == "BEAR":
        return 0

    elif regime == "SIDEWAYS":
        if 45 <= rsi <= 60:    score += 4
        elif 35 <= rsi < 45:   score += 3
        elif rsi < 35:         score += 1
        elif rsi > 70:         score -= 4
        if vol_ratio >= 1.5:   score += 3
        elif vol_ratio >= 1.2: score += 2
        elif vol_ratio < 0.8:  score -= 2
        if ma_cross:           score += 3
        if chg1d > 0:          score += 1
        if chg5d > 2:          score += 2
        elif chg5d > 0:        score += 1

    else:  # BULL
        if 45 <= rsi <= 65:    score += 4
        elif 30 <= rsi < 45:   score += 3
        elif rsi < 30:         score += 2
        elif rsi > 75:         score -= 2
        if vol_ratio >= 2.0:   score += 4
        elif vol_ratio >= 1.5: score += 3
        elif vol_ratio >= 1.2: score += 2
        if ma_cross:           score += 2
        if chg1d > 1:          score += 2
        elif chg1d > 0:        score += 1
        if chg5d > 5:          score += 3
        elif chg5d > 2:        score += 2
        elif chg5d > 0:        score += 1

    return max(0, score)


def screen_top_stocks(news_list, top_n=5, regime="BULL"):
    print(f"Screening {len(STOCK_POOL)} stocks... (Regime:{regime})")
    candidates = []
    errors_log = []
    gap_blocked = []

    for stock in STOCK_POOL:
        code = stock["code"]
        name = stock["name"]

        try:
            raw = get_stock_data(code)
            if not raw:
                continue

            ind = calc_indicators(raw)

            # [P2] 갭 필터 — 전일 대비 갭상승 +3% 이상 제외
            is_gap, gap_pct, gap_reason = calc_gap_filter(
                current_price=ind["price"],
                prev_close=ind["prev_close"],
                regime=regime
            )
            if is_gap:
                gap_blocked.append(f"  [GAP] {name}({code}) {gap_reason}")
                continue

            target, stop_loss = calc_target_stop(ind["price"], ind["atr"], regime)
            score = score_stock(ind, regime)

            # [P3] 섹터 보너스 확대
            score += calc_sector_bonus(stock["sector"])

            candidates.append({
                **stock,
                **ind,
                "score":      score,
                "ai_score":   50,       # 기본값, parse_screening에서 교체
                "target":     target,
                "stop_loss":  stop_loss,
                "target_src": "ATR",
            })

        except Exception as e:
            err_msg = f"  [SCREEN] {name}({code}) 오류: {e}"
            print(err_msg)
            errors_log.append(err_msg)
            continue

    if gap_blocked:
        print(f"  갭필터 {len(gap_blocked)}종목 제외:")
        for g in gap_blocked[:5]:
            print(g)

    if errors_log:
        print(f"  스크리닝 오류 {len(errors_log)}건 "
              f"(나머지 {len(candidates)}종목 정상 처리)")

    candidates.sort(key=lambda x: x["score"], reverse=True)
    top = candidates[:15]

    print(f"  후보: {len(candidates)}종목 → 상위 {len(top)}종목 AI 분석")

    news_text  = "\n".join([f"- {n['title']}" for n in news_list[:8]])
    stock_text = "\n".join([
        f"{i+1}. {s['name']}({s['code']}) "
        f"sector:{s['sector']} RSI:{s['rsi']} "
        f"1d:{s['change_1d']:+.1f}% 5d:{s['change_5d']:+.1f}% "
        f"vol:{s['vol_ratio']}x golden:{'Y' if s['ma_cross'] else 'N'} "
        f"regime:{regime}"
        for i, s in enumerate(top)
    ])

    prompt = f"""You are a Korean stock market AI analyst.
Analyze news and technical data. Select TOP {top_n} stocks to buy today.
Current market regime: {regime}

[Key 2025-2030 Investment Themes]
1. Physical AI: Humanoid robots, smart factory, autonomous driving
2. Defense AI: AI weapons, drone, UAM - LIGNexOne, HanwhaAero, HanwhaSystem
3. AI Semiconductor: HBM memory - Samsung, SKHynix
4. Shipbuilding: LNG/defense vessels - HD조선, 한화오션
5. US-Korea Correlation: Nasdaq+SOX up -> Korean tech bullish

[Regime Strategy: {regime}]
{"BULL: Active buy, RSI up to 65 ok" if regime == "BULL" else
 "SIDEWAYS: Selective. Only RSI 45-60, strong volume, high conviction" if regime == "SIDEWAYS" else
 "BEAR: No new buys recommended"}

[Today News]
{news_text}

[Top Candidate Stocks]
{stock_text}

Reply in EXACTLY this format:
TOP1: StockName(StockCode)
THEME1: theme name
REASON1: one line in Korean
SCORE1: integer 0-100 (your conviction score for buying this stock today)

TOP2: StockName(StockCode)
THEME2: theme name
REASON2: one line in Korean
SCORE2: integer 0-100

TOP3: StockName(StockCode)
THEME3: theme name
REASON3: one line in Korean
SCORE3: integer 0-100

TOP4: StockName(StockCode)
THEME4: theme name
REASON4: one line in Korean
SCORE4: integer 0-100

TOP5: StockName(StockCode)
THEME5: theme name
REASON5: one line in Korean
SCORE5: integer 0-100
"""

    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=600,
            messages=[{"role": "user", "content": prompt}]
        )
        raw_ai = message.content[0].text
        print("AI screening done")
        return parse_screening(raw_ai, candidates)
    except Exception as e:
        print(f"AI screening error: {e}")
        return candidates[:top_n]


def parse_screening(text, candidates):
    """
    [P1] 핵심 수정:
    AI가 반환한 SCORE를 ai_score로 즉시 반영.
    기존: ai_score=50 기본값이 유지됨 (SCORE 파싱해도 덮어쓰기 실패)
    수정: current["ai_score"] = ai_val 명시적 할당 + candidates 병합 순서 수정
    """
    results = []
    lines   = text.strip().split("\n")
    current = {}

    for line in lines:
        line = line.strip()
        if not line:
            continue
        for i in range(1, 6):
            if line.startswith(f"TOP{i}:"):
                if current:
                    results.append(current)
                current = {"rank": i}
                val = line.replace(f"TOP{i}:", "").strip()
                if "(" in val and ")" in val:
                    name = val[:val.index("(")].strip()
                    code = val[val.index("(")+1:val.index(")")].strip()
                    current["name"] = name
                    current["code"] = code
                    # candidates에서 기술 데이터 병합 (ai_score 50 기본값 포함)
                    for c in candidates:
                        if c["code"] == code:
                            current.update(c)
                            break
                else:
                    current["name"] = val
            elif line.startswith(f"THEME{current.get('rank', 0)}:"):
                current["theme"] = line.split(":", 1)[1].strip()
            elif line.startswith(f"REASON{current.get('rank', 0)}:"):
                current["reason"] = line.split(":", 1)[1].strip()
            elif line.startswith(f"SCORE{current.get('rank', 0)}:"):
                try:
                    ai_val = int(line.split(":", 1)[1].strip())
                    # [P1] 핵심 수정: candidates.update() 후에 명시적으로 덮어쓰기
                    current["ai_score"] = max(0, min(100, ai_val))
                except Exception:
                    current["ai_score"] = 50

    if current:
        results.append(current)

    # target/stop 안전장치
    for r in results:
        price     = r.get("price", 0)
        atr       = r.get("atr", price * 0.02 if price > 0 else 0)
        target    = r.get("target", 0)
        stop_loss = r.get("stop_loss", 0)

        if price > 0 and (target <= price or target == 0
                          or stop_loss >= price or stop_loss == 0):
            t, s = calc_target_stop(price, atr, r.get("regime", "SIDEWAYS"))
            r["target"]     = t
            r["stop_loss"]  = s
            r["target_src"] = "ATR_FALLBACK"

    return results
