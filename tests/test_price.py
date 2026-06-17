from decimal import Decimal

from dealbuddy.price import estimate_payable


def test_estimate_payable_only_applies_explicit_full_reduction() -> None:
    result = estimate_payable(
        Decimal("4599"),
        coupon_text="满4000减300",
    )

    assert result == Decimal("4299")


def test_estimate_payable_returns_none_for_ambiguous_discount() -> None:
    result = estimate_payable(
        Decimal("4599"),
        coupon_text="会员专享优惠，具体以结算页为准",
    )

    assert result is None
