from __future__ import annotations

import re
import unicodedata

from dealbuddy.models import CandidateOffer, VerifiedOffer

Offer = CandidateOffer | VerifiedOffer


def _compact(value: str | None) -> str:
    if not value:
        return ""
    normalized = unicodedata.normalize("NFKC", value).lower()
    return re.sub(r"[\s_\-/]+", "", normalized)


def _normalize_size(value: str | None) -> str:
    text = _compact(value).replace("吋", "英寸").replace("寸", "英寸")
    match = re.search(r"(\d+(?:\.\d+)?)英寸", text)
    return f"{match.group(1)}英寸" if match else text


def _normalize_color(value: str | None) -> str:
    text = _compact(value)
    color_aliases = {
        "黑": "黑",
        "曜石黑": "黑",
        "星空黑": "黑",
        "黑色": "黑",
        "白": "白",
        "白色": "白",
        "银": "银",
        "银色": "银",
    }
    for alias, canonical in color_aliases.items():
        if alias in text:
            return canonical
    return text


def _variant_parts(offer: Offer) -> tuple[str, str, str, str, str]:
    specs = offer.specs
    return (
        _compact(offer.brand),
        _compact(offer.model),
        _normalize_size(
            specs.get("screen_size") or specs.get("size") or specs.get("capacity")
        ),
        _normalize_color(specs.get("color")),
        _compact(specs.get("bundle")),
    )


def offer_identity(offer: Offer) -> str:
    return "|".join(_variant_parts(offer))


def same_variant(left: Offer, right: Offer) -> bool:
    left_parts = _variant_parts(left)
    right_parts = _variant_parts(right)
    if not left_parts[1] or not right_parts[1] or left_parts[1] != right_parts[1]:
        return False

    for left_value, right_value in zip(left_parts[2:], right_parts[2:], strict=True):
        if left_value and right_value and left_value != right_value:
            return False
    return not (left_parts[0] and right_parts[0] and left_parts[0] != right_parts[0])
