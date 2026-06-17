from decimal import Decimal

from dealbuddy.intake import (
    CapturePayload,
    add_capture_to_session,
    capture_to_verified_offer,
)
from dealbuddy.models import Platform, RequirementSet
from dealbuddy.session import SessionStore, ShoppingSession


def sample_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "platform": "tmall",
        "url": "https://detail.tmall.com/item.htm?id=1",
        "title": "石头 P20",
        "visible_price": "3425.75",
        "store_name": "石头电器旗舰店",
        "sku_id": "6202090222025",
        "sku_text": "上下水版",
        "selected_sku_text": "上下水版",
        "specs": {"吸力": "18500Pa"},
        "ocr_text": "活水洗地\n自动清洗拖布",
        "confidence": "high",
    }
    payload.update(overrides)
    return payload


def test_capture_payload_converts_to_verified_offer() -> None:
    offer = capture_to_verified_offer(CapturePayload.model_validate(sample_payload()))

    assert offer.platform == Platform.TMALL
    assert offer.visible_price == Decimal("3425.75")
    assert offer.estimated_payable == Decimal("3425.75")
    assert offer.sku == "上下水版"
    assert offer.parameters["sku_id"] == "6202090222025"
    assert offer.parameters["ocr_text"].startswith("活水洗地")
    assert offer.specs["吸力"] == "18500Pa"
    assert offer.confidence.value == "high"


def test_add_capture_to_session_upserts_by_url_and_refreshes_report(tmp_path) -> None:
    store = SessionStore(tmp_path)
    session = ShoppingSession.new(RequirementSet(category="扫地机器人"))
    store.save(session)

    result = add_capture_to_session(
        store,
        session.session_id,
        CapturePayload.model_validate(sample_payload()),
    )
    result = add_capture_to_session(
        store,
        session.session_id,
        CapturePayload.model_validate(sample_payload(visible_price="2999")),
    )

    assert len(result.verified_offers) == 1
    assert result.verified_offers[0]["visible_price"] == "2999"
    assert "DealBuddy 选品报告" in (result.report_markdown or "")
