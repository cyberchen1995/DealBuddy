from __future__ import annotations

import math
from decimal import Decimal

from dealbuddy.matching import _compact
from dealbuddy.models import CandidateOffer, RankedOffer, RequirementSet, VerifiedOffer

Offer = CandidateOffer | VerifiedOffer

_REQUIREMENT_ALIASES = {
    "heating_type": ("即热式", "即热", "速热"),
    "sterilization": ("UV杀菌", "UV紫外", "UV抑菌", "紫外杀菌", "紫外抑菌"),
    "temperature_control": ("调温", "多档调温", "温控", "控温", "多档水温"),
    "keep_warm": ("保温", "恒温"),
}


def _value_matches(actual: str | None, expected: str) -> bool:
    if not actual:
        return False
    normalized_actual = _compact(actual)
    normalized_expected = _compact(expected)
    return (
        normalized_expected in normalized_actual
        or normalized_actual in normalized_expected
    )


def _requirement_matches(
    *,
    key: str,
    actual: str | None,
    search_text: str,
    expected: str,
) -> bool:
    aliases = _REQUIREMENT_ALIASES.get(key, (expected,))
    return any(
        _value_matches(actual, alias) or _value_matches(search_text, alias)
        for alias in aliases
    )


def _price_score(price: Decimal | None, requirements: RequirementSet) -> float:
    if price is None:
        return 0
    if requirements.budget_max is not None:
        if price > requirements.budget_max:
            excess_ratio = float(
                (price - requirements.budget_max) / requirements.budget_max
            )
            return max(-30.0, -100.0 * excess_ratio)
        utilization = float(price / requirements.budget_max)
        return 15.0 * (1.0 - max(0.0, utilization - 0.6))
    return 5.0


def score_offer(offer: Offer, requirements: RequirementSet) -> RankedOffer:
    score = 0.0
    matched: list[str] = []
    unmet: list[str] = []
    search_parts = [
        offer.title,
        offer.brand or "",
        offer.model or "",
        offer.store_name or "",
        *offer.specs.values(),
    ]
    if isinstance(offer, VerifiedOffer):
        search_parts.extend(offer.conditions)
    search_text = " ".join(search_parts)

    for key, expected in requirements.must_have.items():
        actual = offer.specs.get(key)
        if _requirement_matches(
            key=key,
            actual=actual,
            search_text=search_text,
            expected=expected,
        ):
            matched.append(f"{key}={expected}")
            score += 25
        else:
            unmet.append(f"{key}={expected}")
            score -= 60

    for key, expected in requirements.preferences.items():
        actual = offer.specs.get(key)
        if _value_matches(actual, expected) or _value_matches(search_text, expected):
            matched.append(f"{key}={expected}")
            score += 8

    for excluded in requirements.exclusions:
        if _value_matches(search_text, excluded):
            unmet.append(f"排除项:{excluded}")
            score -= 80

    if requirements.brands:
        allowed_brands = "/".join(requirements.brands)
        if any(_value_matches(search_text, brand) for brand in requirements.brands):
            matched.append(f"品牌限制:{allowed_brands}")
            score += 10
        else:
            unmet.append(f"品牌限制:{allowed_brands}")
            score -= 60

    for after_sale in requirements.after_sales:
        if _value_matches(search_text, after_sale):
            matched.append(f"售后要求:{after_sale}")
            score += 10
        else:
            unmet.append(f"售后要求:{after_sale}")
            score -= 60

    price = (
        offer.estimated_payable
        if isinstance(offer, VerifiedOffer)
        else offer.visible_price
    )
    price = price or offer.visible_price
    score += _price_score(price, requirements)

    store_name = offer.store_name or ""
    if any(label in store_name for label in ("自营", "官方旗舰店", "旗舰店")):
        score += 8
    if isinstance(offer, CandidateOffer) and offer.review_count:
        score += min(8.0, math.log10(max(offer.review_count, 1)) * 2)

    hard_requirements_met = not unmet
    reasons = [*matched]
    if price is not None:
        reasons.append(f"页面价格 {price}")
    if store_name:
        reasons.append(f"店铺 {store_name}")
    return RankedOffer(
        offer=offer,
        score=round(score, 2),
        hard_requirements_met=hard_requirements_met,
        matched_requirements=matched,
        unmet_requirements=unmet,
        reasons=reasons,
    )


def rank_offers(
    offers: list[Offer],
    requirements: RequirementSet,
) -> list[RankedOffer]:
    ranked = [score_offer(offer, requirements) for offer in offers]
    return sorted(
        ranked,
        key=lambda item: (item.hard_requirements_met, item.score),
        reverse=True,
    )
