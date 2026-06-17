from __future__ import annotations

import re
from decimal import Decimal


def estimate_payable(
    visible_price: Decimal | None,
    *,
    coupon_text: str | None,
) -> Decimal | None:
    if visible_price is None or not coupon_text:
        return None
    match = re.search(
        r"满\s*(\d+(?:\.\d+)?)\s*(?:元)?\s*减\s*(\d+(?:\.\d+)?)",
        coupon_text,
    )
    if not match:
        return None
    threshold = Decimal(match.group(1))
    reduction = Decimal(match.group(2))
    if visible_price < threshold or reduction >= visible_price:
        return None
    return visible_price - reduction
