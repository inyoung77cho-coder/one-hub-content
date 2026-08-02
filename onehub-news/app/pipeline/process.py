"""raw_ingest -> news_item orchestration (OH-WORK-NEWS-v1.0 §4).

Order: extract facts -> PII scrub -> copyright flag -> LLM summarize (with fallback)
-> category (hashtag override or LLM) -> persist. On LLM failure we degrade to a
caption-based minimal summary and flag for operator attention rather than dropping
the item (§4.3 fallback).
"""
from __future__ import annotations

import logging
from typing import Optional

from sqlalchemy.orm import Session

from ..config import get_settings
from ..llm import get_llm
from ..models import CATEGORIES, NewsItem, NewsRawIngest
from ..schemas import ExtractedFacts, NewsSummary
from . import filters

log = logging.getLogger("onehub.news.process")

# hashtag -> category (§2.2)
HASHTAG_CATEGORY = {
    "#글로벌": "global",
    "#거시": "macro",
    "#증시": "markets",
    "#시장": "markets",
    "#부동산": "realestate",
    "#정책": "policy",
    "#시사": "affairs",
}

# category -> canonical hashtag, for stamping the published headline (§6 below).
# Reverse of HASHTAG_CATEGORY minus the "#시장" alias so each category has one tag.
CATEGORY_HASHTAG = {
    "global": "#글로벌",
    "macro": "#거시",
    "markets": "#증시",
    "realestate": "#부동산",
    "policy": "#정책",
    "affairs": "#시사",
}


def _category_from_hashtags(text: str) -> Optional[str]:
    if not text:
        return None
    for tag, cat in HASHTAG_CATEGORY.items():
        if tag in text:
            return cat
    return None


def process_raw(session: Session, raw: NewsRawIngest) -> Optional[NewsItem]:
    settings = get_settings()
    llm = get_llm()
    raw_text = raw.raw_text or ""
    images = list(raw.image_paths or [])

    # 0) PII scrub the caption BEFORE it reaches the LLM, so personal info in the
    #    operator's text never enters extract()/summarize() (§4.1 — "개인정보 0").
    caption = filters.scrub_pii(raw_text)
    text = caption.text

    # 1) extract (fallback: caption-only facts)
    try:
        extracted = llm.extract(text, images)
    except Exception as exc:  # noqa: BLE001
        log.warning("extract failed (%s) — caption fallback", exc)
        extracted = ExtractedFacts(headline=text.strip()[:200], is_news=bool(text or images))

    if not extracted.is_news:
        raw.processed = True
        session.add(raw)
        return None

    # 2) scrub the extractor output too (an image may have surfaced PII the caption
    #    scrub never saw).
    head_scrub = filters.scrub_pii(extracted.headline)
    extracted.headline = head_scrub.text

    # 3) copyright flag (extractor hint OR marker detection on the original text)
    external = (
        extracted.is_external_publication
        or caption.external_publication
        or filters.detect_external_publication(raw_text)
    )

    # 4) summarize (fallback: minimal caption summary)
    try:
        summary = llm.summarize(extracted)
        fallback_used = False
    except Exception as exc:  # noqa: BLE001
        log.warning("summarize failed (%s) — template fallback", exc)
        summary = _fallback_summary(extracted, external)
        fallback_used = True

    # 5) scrub the generated summary + review gate (§4.2): hold for operator review
    #    (draft) if PII survived or the summary copied source text verbatim.
    sum_scrub = filters.scrub_pii(summary.summary_md)
    summary.summary_md = sum_scrub.text
    review_flags = []
    if sum_scrub.pii_removed or filters.has_residual_pii(summary.summary_md) or head_scrub.pii_removed:
        review_flags.append("pii")
    if filters.verbatim_overlap(summary.summary_md, raw_text):
        review_flags.append("verbatim_copy")

    # 6) category: explicit hashtag wins over LLM classification
    category = _category_from_hashtags(raw_text) or summary.category
    if category not in CATEGORIES:
        category = "affairs"

    # 6b) stamp the resolved category as a visible hashtag on the headline itself —
    #     so the tag is part of the published text, not just the UI's color badge,
    #     regardless of whether the operator typed one or the LLM classified it.
    tag = CATEGORY_HASHTAG[category]
    headline = (summary.headline or extracted.headline or "뉴스").strip()
    if tag not in headline:
        headline = f"{headline[: 200 - len(tag) - 1].rstrip()} {tag}"
    headline = headline[:200]

    # 7) status: hold as draft if approval required, fallback used, or review flags fired.
    hold = settings.news_require_approval or fallback_used or bool(review_flags)
    status = "draft" if hold else "published"

    item = NewsItem(
        category=category,
        headline=headline,
        summary_md=summary.summary_md,
        body_facts=summary.body_facts or extracted.facts,
        image_ref=filters.public_image_ref(external, images[0] if images else None),
        source_label=summary.source_label or ("○○ 보도 기반" if external else "OneHub 제공"),
        external_publication=external,
        importance=summary.importance,
        pinned=False,
        status=status,
        lang=extracted.lang or "ko",
        raw_id=raw.id,
    )
    session.add(item)
    raw.processed = True
    session.add(raw)
    session.flush()  # assign item.id

    if review_flags:
        log.warning("item %s held for review (%s)", item.id, ",".join(review_flags))
    elif fallback_used:
        log.info("item %s created via fallback summary — operator review advised", item.id)
    return item


def _fallback_summary(extracted: ExtractedFacts, external: bool) -> NewsSummary:
    head = extracted.headline or "뉴스"
    return NewsSummary(
        category="affairs",
        headline=head[:200],
        summary_md=f"- {head}",
        body_facts=extracted.facts,
        importance=3,
        source_label="○○ 보도 기반" if external else "OneHub 제공",
    )
