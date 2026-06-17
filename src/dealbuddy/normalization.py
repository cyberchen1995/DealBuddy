from __future__ import annotations

import re

from pydantic import BaseModel, Field


class ProductIdentity(BaseModel):
    brand: str | None = None
    model: str | None = None
    specs: dict[str, str] = Field(default_factory=dict)


_BRANDS = (
    "TCL",
    "海信",
    "小米",
    "华为",
    "荣耀",
    "美的",
    "苏泊尔",
    "九阳",
    "沁园",
    "安吉尔",
    "飞利浦",
    "华帝",
    "凯度",
    "小质",
    "格力",
    "海尔",
    "索尼",
    "三星",
    "LG",
    "松下",
    "西门子",
    "戴森",
    "科沃斯",
    "石头",
    "追觅",
)


def _infer_model(title: str, brand: str | None) -> str | None:
    tokens = re.findall(r"[A-Za-z0-9][A-Za-z0-9._-]{2,}", title)
    for token in tokens:
        compact = token.strip("._-")
        if brand and compact.casefold() == brand.casefold():
            continue
        if (
            re.search(r"[A-Za-z]", compact)
            and re.search(r"\d", compact)
            and not compact.lower().endswith("hz")
        ):
            return compact.upper()
    return None


def infer_product_identity(title: str) -> ProductIdentity:
    brand = next(
        (
            candidate
            for candidate in _BRANDS
            if candidate.casefold() in title.casefold()
        ),
        None,
    )
    specs: dict[str, str] = {}

    size = re.search(r"(\d+(?:\.\d+)?)\s*(?:英寸|吋|寸)", title, re.IGNORECASE)
    if size:
        specs["screen_size"] = f"{size.group(1)}英寸"

    capacity = re.search(
        r"(\d+(?:\.\d+)?)\s*(L|升|ML|毫升|GB|TB)",
        title,
        re.IGNORECASE,
    )
    if capacity:
        unit = capacity.group(2).upper()
        unit = {"升": "L", "毫升": "ML"}.get(unit, unit)
        specs["capacity"] = f"{capacity.group(1)}{unit}"

    if re.search(r"mini\s*led", title, re.IGNORECASE):
        specs["panel_type"] = "Mini LED"
    elif re.search(r"\bOLED\b", title, re.IGNORECASE):
        specs["panel_type"] = "OLED"
    elif re.search(r"\bQLED\b", title, re.IGNORECASE):
        specs["panel_type"] = "QLED"

    refresh_rate = re.search(r"(\d{2,3})\s*Hz", title, re.IGNORECASE)
    if refresh_rate:
        specs["refresh_rate"] = f"{refresh_rate.group(1)}Hz"

    for marker, canonical in (
        ("曜石黑", "黑色"),
        ("星空黑", "黑色"),
        ("黑色", "黑色"),
        ("白色", "白色"),
        ("银色", "银色"),
    ):
        if marker in title:
            specs["color"] = canonical
            break

    for bundle in ("单机", "含挂架", "套装", "主机+配件"):
        if bundle in title:
            specs["bundle"] = bundle
            break

    return ProductIdentity(
        brand=brand,
        model=_infer_model(title, brand),
        specs=specs,
    )
