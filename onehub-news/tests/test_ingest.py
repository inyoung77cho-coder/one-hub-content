"""Ingestion + pipeline tests (M1–M3 DoD)."""
from app.config import get_settings
from app.models import NewsItem, NewsRawIngest
from app.telegram.service import ingest_update, parse_command


def _text_update(update_id, chat_id, text):
    return {
        "update_id": update_id,
        "message": {"message_id": update_id, "chat": {"id": chat_id}, "text": text},
    }


def test_non_operator_ignored(session, tg):
    res = ingest_update(session, _text_update(1, 999, "hello"), tg, get_settings())
    assert res["status"] == "ignored"
    assert session.query(NewsRawIngest).count() == 0


def test_operator_text_creates_published_item(session, tg):
    res = ingest_update(session, _text_update(2, 111, "미 증시 사상 최고"), tg, get_settings())
    assert res["status"] == "ok"
    it = session.get(NewsItem, res["item_id"])
    assert it.status == "published"
    assert it.headline
    assert tg.sent  # operator got a confirmation


def test_idempotent_duplicate_update(session, tg):
    ingest_update(session, _text_update(3, 111, "뉴스 A"), tg, get_settings())
    res = ingest_update(session, _text_update(3, 111, "뉴스 A"), tg, get_settings())
    assert res["status"] == "duplicate"
    assert session.query(NewsRawIngest).count() == 1


def test_external_publication_flag_and_no_image_exposure(session, tg):
    text = "무단전재금지 - 트루카피 리포트\n강남 시세 상승"
    res = ingest_update(session, _text_update(4, 111, text), tg, get_settings())
    it = session.get(NewsItem, res["item_id"])
    assert it.external_publication is True
    assert it.image_ref is None  # external-pub images never republished
    assert "보도 기반" in (it.source_label or "")


def test_hashtag_category_override(session, tg):
    res = ingest_update(session, _text_update(5, 111, "국채 금리 급등 #거시"), tg, get_settings())
    it = session.get(NewsItem, res["item_id"])
    assert it.category == "macro"


def test_headline_carries_visible_category_hashtag(session, tg):
    # The resolved category — whether from an explicit operator hashtag or the
    # LLM's own classification — must show up as a #tag on the published headline
    # text itself, not just the category field, so readers see it in the content.
    res = ingest_update(session, _text_update(6, 111, "강남 재건축 시세 상승 #부동산"), tg, get_settings())
    it = session.get(NewsItem, res["item_id"])
    assert it.category == "realestate"
    assert "#부동산" in it.headline

    # No hashtag typed at all — StubLLM defaults to "affairs", which still must
    # surface as its own tag rather than being silently left off.
    res2 = ingest_update(session, _text_update(7, 111, "미 증시 사상 최고"), tg, get_settings())
    it2 = session.get(NewsItem, res2["item_id"])
    assert it2.category == "affairs"
    assert "#시사" in it2.headline


def test_parse_command():
    assert parse_command("/pin") == ("pin", "")
    assert parse_command("/importance 12 4") == ("importance", "12 4")
    assert parse_command("just text") is None
