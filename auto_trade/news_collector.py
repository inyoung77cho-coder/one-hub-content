# news_collector.py — ONE-HUB v6.0
# ============================================================
# v6.0 핵심 개선 (AWS 배포 전 최종 품질 개선):
#
#   [N1] 뉴스 스코어링 엔진
#        - impact_score:    시장 영향도 키워드 기반
#        - freshness_score: 최신성 (6h/24h/48h 단계)
#        - total_score:     impact 60% + freshness 40%
#
#   [N2] 테마별 분류 출력 (Telegram 메시지 개선)
#        기존: "headline 1, 2, 3..." 나열
#        개선: [Macro] [AI·반도체] [방산] [로봇·조선] [국내수급] 섹션 분리
#
#   [N3] 6시간 캐시 기반 중복 제거
#        - 제목 앞 40자 해시로 동일 뉴스 재출력 차단
#        - TTL 6시간 → 다음 분석 사이클에서도 방어
#
#   [N4] 포트폴리오 연동 뉴스 (get_portfolio_news)
#        - 현재 보유종목 코드 기반 관련 뉴스만 추출
#        - PORTFOLIO_KEYWORDS 딕셔너리로 종목별 키워드 매핑
#
#   [N5] Other 카테고리 + 저임팩트 노이즈 자동 제거
#        - theme=Other & impact<10 → 필터링
# ============================================================

import feedparser
import requests
import yfinance as yf
import hashlib
import time as _time

# ── 뉴스 피드 ────────────────────────────────────────────────
DOMESTIC_FEEDS = [
    # 한국경제 → 새 URL
    "https://www.hankyung.com/feed/finance",
    # 매일경제 → 대안
    "https://www.mk.co.kr/rss/30000001/",
    # 이인포맥스 (정상)
    "https://news.einfomax.co.kr/rss/allArticle.xml",
    # 서울경제 (정상)
    "https://www.sedaily.com/RSS/",
    # 연합뉴스 경제 (추가)
    "https://www.yonhapnewstv.co.kr/browse/feed/",
]

GLOBAL_FEEDS = [
    # Reuters → 대안 (AP, BBC)
    "https://feeds.bbci.co.uk/news/business/rss.xml",
    # AP News → CNBC로 교체
    "https://www.cnbc.com/id/10000664/device/rss/rss.html",
    # MarketWatch (정상)
    "https://feeds.content.dowjones.io/public/rss/mw_realtimeheadlines",
    # TechCrunch (정상)
    "https://techcrunch.com/feed/",
]

# ── [N3] 뉴스 중복 캐시 (6시간 TTL) ─────────────────────────
_news_seen_cache = {}
_NEWS_DEDUP_TTL  = 6 * 3600

# ── [N2] 테마 분류 키워드 ────────────────────────────────────
THEME_KEYWORDS = {
    "Macro": [
        "fed", "fomc", "interest rate", "금리", "inflation", "인플레",
        "gdp", "recession", "경기침체", "cpi", "pce", "treasury", "국채",
        "yield", "수익률", "달러", "dollar", "환율", "bank of england",
        "ecb", "boj", "central bank", "중앙은행", "tariff", "관세",
        "trade war", "무역전쟁", "geopolitical", "지정학",
        "swiss national bank", "스위스", "영란은행",
        # 추가: 외환/환시 관련
        "환시", "외환", "엔화", "yen", "yuan", "위안", "파운드", "pound",
        "유로", "euro", "franc", "프랑", "쇼트", "달러인덱스",
        "외국인", "스무딩", "매파", "비둘기", "hawkish", "dovish",
        # 추가: 거시경제 지표
        "pmi", "실업률", "unemployment", "소비자물가", "생산자물가",
        "무역수지", "경상수지", "기준금리",
    ],
    "AI_Semiconductor": [
        "nvidia", "tsmc", "ai chip", "hbm", "semiconductor", "반도체",
        "artificial intelligence", "인공지능", "gpu", "npu", "foundry", "파운드리",
        "advanced packaging", "hpsp", "원익", "한미반도체",
        "sk하이닉스", "삼성전자", "intel", "amd",
        "arm holdings", "arm chip", "arm 설계",  # arm 단독 → 오매칭 원인
        "data center", "데이터센터", "llm", "주성엔지니어링",
        "deepseek", "openai", "chatgpt", "gemini",  # anthropic 제거 → Menlo/Anthropic 펀드 오매칭
        "반도체 장비", "식각", "cmp",
        "메모리", "memory", "dram", "nand", "hbm",
        # taiwan 제거 — 지정학 기사 오매칭 원인
    ],
    "Defense": [
        "defense", "방산", "military", "nato", "군비", "무기",
        "한화", "lg넥스원", "현대로템", "방위", "k9", "k2",
        "aerospace", "ukraine", "우크라", "중동",
        "전쟁", "war", "국방비", "방위산업",
        # 추가
        "방공", "미사일", "missile", "드론", "drone", "함정",
        "한화에어로", "한화시스템", "lg넥스", "빅텍",
        "poongsan", "풍산", "기아방산", "현대위아",
        "방위조달", "록히드", "lockheed", "raytheon",
    ],
    "Robot_Shipbuilding": [
        "robot", "로봇", "automation", "자동화", "현대중공업",
        "조선", "shipbuilding", "hd한국조선", "삼성중공업",
        "레인보우로보틱스", "hn로보틱스", "humanoid", "휴머노이드",
        # 추가
        "두산로보틱스", "현대로보틱스", "티로보틱스",
        "선박", "vessel", "lng선", "컨테이너선",
        "대우조선", "한화오션", "physical ai",
    ],
    "Domestic_Flow": [
        "외국인", "기관", "순매수", "순매도", "수급",
        "코스피", "kospi", "코스닥", "kosdaq",
        "프로그램", "공매도", "etf", "펀드", "연기금",
        # 추가
        "국민연금", "사모펀드", "외인", "개인투자",
        "시가총액", "거래대금", "상한가", "하한가",
        "52주 신고가", "신저가", "급등주", "테마주",
    ],
}

THEME_LABEL = {
    "Macro":              "Macro",
    "AI_Semiconductor":   "AI·반도체",
    "Defense":            "방산·항공",
    "Robot_Shipbuilding": "로봇·조선",
    "Domestic_Flow":      "국내수급",
}

# ── [N4] 포트폴리오 키워드 매핑 ──────────────────────────────
PORTFOLIO_KEYWORDS = {
    "403870": ["hpsp", "HPSP", "압력 산화"],
    "240810": ["원익IPS", "원익ips"],
    "012450": ["한화에어로", "hanwha aerospace"],
    "000880": ["한화", "hanwha"],
    "079550": ["lg넥스원", "넥스원"],
    "005930": ["삼성전자", "samsung electronics"],
    "000660": ["sk하이닉스", "sk hynix", "hynix"],
    "005380": ["현대차", "hyundai motor", "현대자동차"],
    "000270": ["기아", "kia"],
    "166090": ["하나머티리얼즈", "hana materials", "하나머티"],  # HN로보틱스 아님!
    "277810": ["레인보우로보틱스", "rainbow robotics"],
    "267260": ["현대로템", "hyundai rotem"],
    "042700": ["한미반도체", "hanmi semiconductor"],
    "336370": ["솔브레인", "soulbrain"],
}

# 종목코드 → 섹터 매핑
CODE_TO_SECTOR = {
    "403870": "반도체장비",    # HPSP
    "240810": "반도체장비",    # 원익IPS
    "012450": "방산",          # 한화에어로스페이스
    "000880": "방산",          # 한화
    "079550": "방산",          # LG넥스원
    "267260": "방산",          # 현대로템
    "005380": "완성차",        # 현대차
    "000270": "완성차",        # 기아
    "005930": "AI반도체",      # 삼성전자
    "000660": "AI반도체",      # SK하이닉스
    "166090": "반도체장비",    # 하나머티리얼즈 (반도체 소재)
    "277810": "로봇",          # 레인보우로보틱스
    "042700": "반도체장비",    # 한미반도체
    "336370": "반도체장비",    # 솔브레인
}


# ══════════════════════════════════════════════════════════
# [N3] 중복 제거 유틸
# ══════════════════════════════════════════════════════════

def _title_hash(title):
    normalized = title.strip().lower()[:40]
    return hashlib.md5(normalized.encode()).hexdigest()


def _is_seen(title):
    now = _time.time()
    expired = [k for k, ts in list(_news_seen_cache.items()) if now - ts > _NEWS_DEDUP_TTL]
    for k in expired:
        _news_seen_cache.pop(k, None)
    h = _title_hash(title)
    if h in _news_seen_cache:
        return True
    _news_seen_cache[h] = now
    return False


# ══════════════════════════════════════════════════════════
# [N1] 뉴스 스코어링
# ══════════════════════════════════════════════════════════

def _calc_impact_score(title, summary):
    text = (title + " " + summary).lower()
    score = 0
    high_impact = [
        # 영문 — 변형 표현 포함
        "rate hike", "rate cut", "cuts rates", "raises rates",
        "cuts interest", "raises interest", "rate decision",
        "earnings beat", "earnings miss",
        "acquisition", "merger", "bankruptcy", "default", "ipo",
        "sanctions", "trump", "tariff",
        # 한글 — 띄어쓰기 변형 모두 포함
        "금리 인상", "금리인상", "금리 인하", "금리인하",
        "실적 서프라이즈", "실적서프라이즈", "어닝 서프라이즈",
        "인수합병", "인수 합병", "파산", "디폴트", "상장", "제재",
        "관세 인상", "관세인상", "무역전쟁", "긴급",
    ]
    mid_impact = [
        # 영문
        "forecast", "guidance", "rally", "surge", "plunge",
        "record high", "upgrade", "downgrade", "supply chain",
        # 한글
        "전망", "목표가", "급등", "급락", "사상 최고", "사상최고",
        "공급망", "기준금리", "기준 금리", "수익률 곡선",
        "순매수", "순매도", "외국인 매수", "외국인 매도",
        "신고가", "신저가", "상한가", "하한가",
    ]
    low_impact = [
        "says", "comments", "speech", "meeting", "conference",
        "발언", "회의", "컨퍼런스", "밝혔다", "전했다",
    ]
    for kw in high_impact:
        if kw in text:
            score += 20
    for kw in mid_impact:
        if kw in text:
            score += 10
    for kw in low_impact:
        if kw in text:
            score += 5
    return min(score, 100)


def _classify_theme(title, summary):
    text = (title + " " + summary).lower()

    # 오분류 방지 제외 키워드
    # 삼성전자 키워드가 있어도 노사/파업/인사 뉴스는 AI반도체 아님
    _EXCLUDE = {
        "AI_Semiconductor": [
            "노사", "파업", "위원장", "조합", "임단협", "인사", "대표이사",
            # 대만 지정학 → 반도체 아닌 외교/군사 뉴스
            "trump-xi", "무기 팔", "무기 판매", "협상칩",
            "국가안보도", "defining issue",
        ],
        "Defense": [
            "원전", "화재", "사고", "재난", "구조", "침몰", "좌초",
            # 무기 판매 외교 기사 (실제 방산 수주 아님)
            "무기 팔수도", "무기 판매 여부", "협상칩", "국가안보도",
            "trump-xi", "트럼프 xi",
        ],
    }

    for theme, keywords in THEME_KEYWORDS.items():
        for kw in keywords:
            if kw.lower() in text:
                # 제외 키워드 체크
                excludes = _EXCLUDE.get(theme, [])
                if any(ex in text for ex in excludes):
                    break
                return theme
    return "Other"


def _calc_freshness(entry):
    try:
        import time as t
        published = entry.get("published_parsed") or entry.get("updated_parsed")
        if published:
            age_hours = (t.time() - t.mktime(published)) / 3600
            if age_hours <= 6:   return 100
            if age_hours <= 24:  return 60
            if age_hours <= 48:  return 30
        return 20
    except Exception:
        return 50


# ══════════════════════════════════════════════════════════
# 원본 기사 수집
# ══════════════════════════════════════════════════════════

FEED_TIMEOUT = 5   # 피드당 최대 대기 시간 (초)

def _parse_feed_safe(url: str, timeout: int = FEED_TIMEOUT):
    """
    requests로 타임아웃 제한 후 feedparser로 파싱.
    feedparser.parse(url) 직접 호출은 타임아웃이 없어 무한 대기 가능.
    """
    try:
        res = requests.get(
            url, timeout=timeout,
            headers={"User-Agent": "Mozilla/5.0 (compatible; ONE-HUB/6.0)"},
        )
        res.raise_for_status()
        return feedparser.parse(res.text)
    except requests.exceptions.Timeout:
        print(f"  [FEED TIMEOUT] {url[:50]}")
        return None
    except requests.exceptions.RequestException as e:
        print(f"  [FEED ERROR] {url[:50]}: {e}")
        return None
    except Exception as e:
        print(f"  [FEED PARSE ERROR] {url[:50]}: {e}")
        return None


def _fetch_raw_articles():
    articles = []

    for url in DOMESTIC_FEEDS:
        feed = _parse_feed_safe(url)
        if not feed:
            continue
        try:
            for entry in feed.entries[:5]:
                title = entry.get("title", "").strip()
                if not title:
                    continue
                articles.append({
                    "title":   title,
                    "summary": entry.get("summary", "")[:300],
                    "source":  feed.feed.get("title", ""),
                    "type":    "domestic",
                    "entry":   entry,
                })
        except Exception as e:
            print(f"Domestic feed parse error: {e}")

    for url in GLOBAL_FEEDS:
        feed = _parse_feed_safe(url)
        if not feed:
            continue
        try:
            for entry in feed.entries[:4]:
                title = entry.get("title", "").strip()
                if not title:
                    continue
                articles.append({
                    "title":   title,
                    "summary": entry.get("summary", "")[:300],
                    "source":  feed.feed.get("title", ""),
                    "type":    "global",
                    "entry":   entry,
                })
        except Exception as e:
            print(f"Global feed parse error: {e}")

    return articles


def _score_and_filter(articles):
    scored = []
    for a in articles:
        title   = a["title"]
        summary = a.get("summary", "")

        # [N3] 중복 제거
        if _is_seen(title):
            continue

        theme  = _classify_theme(title, summary)
        impact = _calc_impact_score(title, summary)
        fresh  = _calc_freshness(a.get("entry", {}))

        # 노이즈 필터: 테마 미분류 + 저임팩트 제거
        # impact 20 미만 Other → 홈플러스 자금지원, 정치뉴스 등 투자 무관 기사 차단
        if theme == "Other" and impact < 20:
            continue

        total = impact * 0.6 + fresh * 0.4
        scored.append({**a, "theme": theme, "impact_score": impact,
                        "freshness": fresh, "total_score": total})

    scored.sort(key=lambda x: x["total_score"], reverse=True)
    return scored


# ══════════════════════════════════════════════════════════
# 공개 API
# ══════════════════════════════════════════════════════════

def get_news(max_items=15):
    """
    기존 호환 유지. 내부적으로 스코어링+중복제거 적용.
    전체 수집에 최대 30초 제한 — 피드 장애 시 분석 블로킹 방지.
    """
    import concurrent.futures
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as ex:
            future = ex.submit(_fetch_raw_articles)
            try:
                raw = future.result(timeout=30)
            except concurrent.futures.TimeoutError:
                print("[NEWS] 전체 피드 수집 30초 초과 → 빈 결과 반환")
                raw = []
    except Exception as e:
        print(f"[NEWS] get_news 예외: {e}")
        raw = []

    filtered = _score_and_filter(raw)
    result   = []
    for a in filtered[:max_items]:
        result.append({
            "title":        a["title"],
            "summary":      a.get("summary", "")[:200],
            "source":       a["source"],
            "type":         a["type"],
            "theme":        a.get("theme", "Other"),
            "impact_score": a.get("impact_score", 0),
        })
    return result


def get_themed_news_message(news_list=None, max_per_theme=2):
    """
    [N2] 테마별 분류 뉴스 메시지.
    main.py의 news_msg 생성 로직을 이 함수로 교체하면 됨.
    """
    if news_list is None:
        news_list = get_news(max_items=30)

    themed = {theme: [] for theme in THEME_LABEL}
    themed["Other"] = []

    for n in news_list:
        t = n.get("theme", "Other")
        themed.setdefault(t, []).append(n)

    msg = "Today News\n"
    has_content = False

    for theme_key, label in THEME_LABEL.items():
        items = themed.get(theme_key, [])[:max_per_theme]
        if not items:
            continue
        msg += f"\n[{label}]\n"
        for n in items:
            msg += f"- {n['title'][:65]}\n"
        has_content = True

    if not has_content:
        msg += "\n뉴스 수집 중...\n"

    return msg.strip()


# ── 섹터별 뉴스 키워드 (종목 코드 없이도 섹터로 매칭) ────────
SECTOR_KEYWORDS = {
    "반도체장비": [
        "반도체 장비", "semiconductor equipment",
        "식각", "cvd", "ald", "cmp", "웨이퍼", "wafer", "공정장비",
        "hpsp", "원익ips", "주성엔지니어링", "한미반도체",
        "어플라이드 머티리얼", "applied materials", "lam research",
        # 넓은 키워드는 제거 (etch, taiwan 등 오매칭 원인)
    ],
    "방산": [
        # 드론/drone은 제거 (UAE원전 같은 사고 기사 오매칭)
        "방산", "방위산업", "국방비", "방위비",
        "k9 자주포", "k2 전차", "한화에어로",
        "lg넥스원", "현대로템", "nato 국방",
        "방공 미사일", "무기 수출", "방산 수주",
        "록히드", "레이시온", "boeing defense",
    ],
    "완성차": [
        # ev/배터리 같은 넓은 키워드 제거 (오매칭 원인)
        "현대차", "기아차", "hyundai motor", "kia motors",
        "자동차 판매", "완성차", "차량용 반도체",
        "현대차 전기차", "기아 전기차",
        "테슬라", "toyota", "byd",
    ],
    "AI반도체": [
        "hbm", "nvidia", "ai 반도체", "gpu", "npu",
        "sk하이닉스", "삼성전자 반도체",
        "tsmc", "인공지능 칩",
        "데이터센터 ai", "llm", "온디바이스 ai",
    ],
}

# 섹터 뉴스 제외 키워드 (오매칭 방지)
SECTOR_EXCLUDE = {
    "방산":      ["원전", "화재", "사고", "재난", "구조", "침몰", "좌초", "폭발 사고"],
    "완성차":    ["연준", "fed", "금리", "채권", "국채", "warsh", "파powell"],
    "AI반도체":  ["노사", "파업", "위원장", "조합"],
    "반도체장비": [
        # 대만 지정학 기사 제외 (taiwan이 반도체장비로 오매칭되는 원인)
        "trump-xi", "trump xi", "양안", "대만 해협", "무기 판매",
        "defining issue", "geopolit",
    ],
}

# 종목코드 → 섹터 매핑


def get_portfolio_news(holdings, news_list=None):
    """
    [N4 v6.1] 포트폴리오 기반 뉴스 — 2단계 매칭

    1단계: 종목명 직접 매칭 (HPSP 관련 뉴스)
    2단계: 섹터 매칭 (반도체장비 섹터 뉴스 → HPSP/원익IPS 수혜)

    반환: Telegram용 문자열 (없으면 빈 문자열)
    """
    if not holdings:
        return ""
    if news_list is None:
        news_list = get_news(max_items=30)

    # 보유종목 코드 추출
    held_codes = []
    for h in holdings:
        code = (h.get("stck_shrn_iscd") or h.get("pdno") or
                h.get("code", "")).strip()
        if code:
            held_codes.append(code)

    if not held_codes:
        return ""

    # ── 1단계: 종목 직접 매칭 ──────────────────────────────
    stock_hits = {}   # {code: [뉴스, ...]}
    for code in held_codes:
        keywords = PORTFOLIO_KEYWORDS.get(code, [])
        if not keywords:
            continue
        matched = []
        for n in news_list:
            text = (n["title"] + " " + n.get("summary", "")).lower()
            if any(kw.lower() in text for kw in keywords):
                matched.append(n)
        if matched:
            # 임팩트 높은 순 정렬
            matched.sort(key=lambda x: x.get("impact_score", 0), reverse=True)
            stock_hits[code] = matched[:2]

    # ── 2단계: 섹터 매칭 ──────────────────────────────────
    # 보유종목의 섹터를 수집
    held_sectors = {}   # {sector: [code, ...]}
    for code in held_codes:
        sector = CODE_TO_SECTOR.get(code)
        if sector:
            held_sectors.setdefault(sector, []).append(code)

    sector_hits = {}   # {sector: [뉴스, ...]}
    for sector, codes in held_sectors.items():
        sector_kws  = SECTOR_KEYWORDS.get(sector, [])
        exclude_kws = SECTOR_EXCLUDE.get(sector, [])
        matched = []
        for n in news_list:
            text = (n["title"] + " " + n.get("summary", "")).lower()
            # 제외 키워드 먼저 체크
            if any(ex in text for ex in exclude_kws):
                continue
            if any(kw.lower() in text for kw in sector_kws):
                already = any(n in hits for hits in stock_hits.values())
                if not already:
                    matched.append(n)
        if matched:
            matched.sort(key=lambda x: x.get("impact_score", 0), reverse=True)
            sector_hits[sector] = matched[:1]

    # ── 메시지 조합 ────────────────────────────────────────
    if not stock_hits and not sector_hits:
        return ""

    lines = ["[보유종목 관련 뉴스]"]

    # 종목 직접 뉴스
    for code in held_codes:
        if code not in stock_hits:
            continue
        name = _get_stock_name(code, holdings)
        for n in stock_hits[code]:
            impact_flag = " 🔥" if n.get("impact_score", 0) >= 20 else ""
            lines.append(f"  {name}: {n['title'][:55]}{impact_flag}")

    # 섹터 뉴스 (종목 직접 뉴스가 없는 섹터)
    for sector, news_items in sector_hits.items():
        # 해당 섹터 보유 종목명 나열
        codes_in_sector = held_sectors.get(sector, [])
        names = [_get_stock_name(c, holdings) for c in codes_in_sector]
        names_str = "/".join(names[:2])
        for n in news_items:
            lines.append(f"  [{sector}→{names_str}]: {n['title'][:50]}")

    return "\n".join(lines)


def _get_stock_name(code, holdings):
    for h in holdings:
        c = (h.get("stck_shrn_iscd") or h.get("pdno") or h.get("code", "")).strip()
        if c == code:
            return h.get("prdt_name") or h.get("name") or code
    return code


# ══════════════════════════════════════════════════════════
# 글로벌 시장 데이터 (기존 그대로)
# ══════════════════════════════════════════════════════════

def get_global_market():
    data = {}
    try:
        tickers = {
            "nasdq":  "^IXIC",
            "sp500":  "^GSPC",
            "dow":    "^DJI",
            "vix":    "^VIX",
            "sox":    "^SOX",
            "usdkrw": "KRW=X",
            "us10y":  "^TNX",
            "wti":    "CL=F",
            "gold":   "GC=F",
            "copper": "HG=F",
            "dxy":    "DX-Y.NYB",
        }
        for key, ticker in tickers.items():
            try:
                t    = yf.Ticker(ticker)
                hist = t.history(period="5d")
                if not hist.empty:
                    closes = [c for c in hist["Close"].tolist() if c == c]  # NaN 제거
                    if not closes:
                        continue
                    price  = closes[-1]
                    chg    = round((closes[-1]-closes[-2])/closes[-2]*100, 2) if len(closes)>=2 else 0
                    data[key] = {"price": round(price, 2), "change": chg}
            except:
                pass

        _fg_ok = False
        try:
            res = requests.get(
                "https://production.dataviz.cnn.io/index/fearandgreed/graphdata",
                timeout=5, headers={"User-Agent": "Mozilla/5.0"}
            )
            if res.status_code == 200:
                fg     = res.json()
                score  = fg.get("fear_and_greed", {}).get("score", None)
                rating = fg.get("fear_and_greed", {}).get("rating", "Neutral")
                if score is not None:
                    data["fear_greed"] = {"score": round(float(score),1), "rating": rating, "source": "CNN"}
                    _fg_ok = True
        except Exception as _e:
            print(f"CNN Fear&Greed error: {_e}")

        if not _fg_ok:
            try:
                res2 = requests.get("https://api.alternative.me/fng/?limit=1&format=json", timeout=5)
                if res2.status_code == 200:
                    fng_data = res2.json().get("data", [{}])[0]
                    score2   = int(fng_data.get("value", 50))
                    rating2  = fng_data.get("value_classification", "Neutral")
                    data["fear_greed"] = {"score": float(score2), "rating": rating2, "source": "alternative.me"}
                    _fg_ok = True
            except Exception as _e2:
                print(f"alternative.me Fear&Greed error: {_e2}")

        if not _fg_ok:
            data["fear_greed"] = {"score": 50, "rating": "Neutral", "source": "default"}

        try:
            samsung = yf.Ticker("005930.KS")
            info    = samsung.info
            data["samsung_foreign"] = {"held_pct": info.get("heldPercentInstitutions", 0) * 100}
        except:
            pass

    except Exception as e:
        print(f"Global market error: {e}")

    return data


def get_economic_indicators():
    indicators = {}
    try:
        t2y  = yf.Ticker("^IRX")
        t10y = yf.Ticker("^TNX")
        h2y  = t2y.history(period="5d")["Close"].tolist()
        h10y = t10y.history(period="5d")["Close"].tolist()
        if h2y and h10y:
            spread = round(h10y[-1] - h2y[-1], 3)
            indicators["yield_curve"] = {"spread": spread, "inverted": spread < 0}

        wti  = yf.Ticker("CL=F")
        hwti = wti.history(period="5d")["Close"].tolist()
        if hwti:
            indicators["wti"] = {
                "price":  round(hwti[-1], 2),
                "change": round((hwti[-1]-hwti[-2])/hwti[-2]*100, 2) if len(hwti)>=2 else 0
            }

        gold  = yf.Ticker("GC=F")
        hgold = gold.history(period="5d")["Close"].tolist()
        if hgold:
            indicators["gold"] = {
                "price":  round(hgold[-1], 2),
                "change": round((hgold[-1]-hgold[-2])/hgold[-2]*100, 2) if len(hgold)>=2 else 0
            }

        copper  = yf.Ticker("HG=F")
        hcopper = copper.history(period="5d")["Close"].tolist()
        if hcopper:
            indicators["copper"] = {
                "price":  round(hcopper[-1], 4),
                "change": round((hcopper[-1]-hcopper[-2])/hcopper[-2]*100, 2) if len(hcopper)>=2 else 0
            }

    except Exception as e:
        print(f"Economic indicators error: {e}")

    return indicators


def get_market_data(stock_code):
    try:
        ticker = yf.Ticker(f"{stock_code}.KS")
        hist   = ticker.history(period="60d")
        if hist.empty or len(hist) < 21:
            return {}

        closes  = hist["Close"].tolist()
        volumes = hist["Volume"].tolist()
        highs   = hist["High"].tolist()
        lows    = hist["Low"].tolist()

        price = closes[-1]
        ma5   = sum(closes[-5:])  / 5
        ma20  = sum(closes[-20:]) / 20
        ma60  = sum(closes[-60:]) / 60 if len(closes)>=60 else ma20

        vol_avg   = sum(volumes[-5:]) / 5 if len(volumes)>=5 else 1
        vol_ratio = round(volumes[-1] / vol_avg, 2) if vol_avg > 0 else 1

        chg1d  = round((closes[-1]-closes[-2])/closes[-2]*100, 2) if len(closes)>=2  else 0
        chg5d  = round((closes[-1]-closes[-6])/closes[-6]*100, 2) if len(closes)>=6  else 0
        chg20d = round((closes[-1]-closes[-21])/closes[-21]*100, 2) if len(closes)>=21 else 0

        gains  = [closes[i]-closes[i-1] for i in range(1,len(closes)) if closes[i]>closes[i-1]]
        losses = [closes[i-1]-closes[i] for i in range(1,len(closes)) if closes[i]<closes[i-1]]
        avg_g  = sum(gains[-14:]) / 14 if gains else 0
        avg_l  = sum(losses[-14:]) / 14 if losses else 1e-9
        rsi    = round(100-(100/(1+avg_g/avg_l)), 1)

        ma20_list = closes[-20:]
        std20     = (sum((x-ma20)**2 for x in ma20_list)/20)**0.5
        bb_upper  = ma20 + 2*std20
        bb_lower  = ma20 - 2*std20
        bb_pos    = round((price-bb_lower)/(bb_upper-bb_lower)*100,1) if bb_upper!=bb_lower else 50

        ema12 = closes[-1]
        ema26 = closes[-1]
        for i in range(12):
            ema12 = ema12*0.154 + closes[-2-i]*0.846 if len(closes)>i+1 else ema12
        for i in range(26):
            ema26 = ema26*0.074 + closes[-2-i]*0.926 if len(closes)>i+1 else ema26
        macd = round(ema12 - ema26, 0)

        year_high = max(highs[-252:]) if len(highs)>=252 else max(highs)
        year_low  = min(lows[-252:])  if len(lows)>=252  else min(lows)
        from_high = round((price-year_high)/year_high*100, 1)

        return {
            "current_price": round(price, 0),
            "ma5":           round(ma5, 0),
            "ma20":          round(ma20, 0),
            "ma60":          round(ma60, 0),
            "rsi":           rsi,
            "change_1d":     chg1d,
            "change_5d":     chg5d,
            "change_20d":    chg20d,
            "volume_ratio":  vol_ratio,
            "bb_position":   bb_pos,
            "macd":          macd,
            "year_high":     round(year_high, 0),
            "year_low":      round(year_low, 0),
            "from_high":     from_high,
        }
    except Exception as e:
        print(f"Market data error ({stock_code}): {e}")
        return {}
