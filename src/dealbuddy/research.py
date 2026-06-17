from __future__ import annotations

import re
from collections import defaultdict

from dealbuddy.models import ParameterCatalog, ParameterDefinition, VerifiedOffer

_KEY_PARAMETERS = {
    "品牌": "brand",
    "型号": "model",
    "屏幕尺寸": "screen_size",
    "尺寸": "size",
    "容量": "capacity",
    "显示技术": "panel_type",
    "背光方式": "backlight",
    "处理器": "processor",
    "内存": "memory",
    "存储": "storage",
    "刷新率": "refresh_rate",
    "功率": "power",
}
_MARKETING_MARKERS = ("ai", "大师", "旗舰", "臻彩", "超感", "黑科技", "调校")


def _parameter_key(name: str) -> str:
    if name in _KEY_PARAMETERS:
        return _KEY_PARAMETERS[name]
    key = re.sub(r"\W+", "_", name.lower()).strip("_")
    return key or f"parameter_{abs(hash(name))}"


def _importance(name: str, values: list[str]) -> str:
    if name in _KEY_PARAMETERS:
        return "key"
    combined = f"{name} {' '.join(values)}".lower()
    if any(marker in combined for marker in _MARKETING_MARKERS):
        return "marketing"
    return "general"


def build_parameter_catalog(
    category: str,
    offers: list[VerifiedOffer],
) -> ParameterCatalog:
    values_by_name: dict[str, list[str]] = defaultdict(list)
    for offer in offers:
        # 采集模式下规格在 specs，OCR 文本在 parameters["ocr_text"]；两者合并取参数，
        # 但排除 ocr_text 这段长文本，避免污染参数目录。
        combined = {**offer.specs, **offer.parameters}
        for name, value in combined.items():
            if name == "ocr_text":
                continue
            value = value.strip()
            if value and value not in values_by_name[name]:
                values_by_name[name].append(value)

    definitions = [
        ParameterDefinition(
            key=_parameter_key(name),
            name=name,
            importance=_importance(name, values),
            common_values=values,
            evidence_count=sum(name in offer.parameters for offer in offers),
        )
        for name, values in values_by_name.items()
    ]
    importance_order = {"key": 0, "general": 1, "marketing": 2}
    definitions.sort(
        key=lambda item: (
            importance_order[item.importance],
            -item.evidence_count,
            item.name,
        )
    )

    prices = [
        offer.visible_price for offer in offers if offer.visible_price is not None
    ]
    models = [
        offer.model or offer.parameters.get("型号") or offer.title for offer in offers
    ]
    return ParameterCatalog(
        category=category,
        parameters=definitions,
        price_min=min(prices) if prices else None,
        price_max=max(prices) if prices else None,
        representative_models=list(dict.fromkeys(models))[:10],
    )
