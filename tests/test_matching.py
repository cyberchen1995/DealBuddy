from decimal import Decimal

from dealbuddy.matching import offer_identity, same_variant
from dealbuddy.models import CandidateOffer, Platform


def make_offer(**overrides: object) -> CandidateOffer:
    values: dict[str, object] = {
        "platform": Platform.JD,
        "title": "TCL 65Q10K 65英寸 Mini LED 电视 黑色 单机",
        "url": "https://item.jd.com/2001.html",
        "visible_price": Decimal("4599"),
        "brand": "TCL",
        "model": "65Q10K",
        "specs": {"screen_size": "65英寸", "color": "黑色", "bundle": "单机"},
    }
    values.update(overrides)
    return CandidateOffer(**values)


def test_same_variant_matches_equivalent_units_and_spacing() -> None:
    left = make_offer()
    right = make_offer(
        platform=Platform.TAOBAO,
        title="TCL电视 Q10K 65 吋 MiniLED 黑色 单机",
        url="https://item.taobao.com/item.htm?id=1001",
        specs={"screen_size": "65 吋", "color": "曜石黑", "bundle": "单机"},
    )

    assert same_variant(left, right)
    assert offer_identity(left) == offer_identity(right)


def test_same_model_different_size_or_bundle_is_not_merged() -> None:
    left = make_offer()
    larger = make_offer(
        specs={"screen_size": "75英寸", "color": "黑色", "bundle": "单机"}
    )
    bundle = make_offer(
        specs={"screen_size": "65英寸", "color": "黑色", "bundle": "含挂架"}
    )

    assert not same_variant(left, larger)
    assert not same_variant(left, bundle)
