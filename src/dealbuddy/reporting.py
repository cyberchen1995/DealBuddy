from __future__ import annotations

from decimal import Decimal

from dealbuddy.models import RankedOffer, RequirementSet, VerifiedOffer


def _display_price(item: RankedOffer) -> Decimal | None:
    offer = item.offer
    if isinstance(offer, VerifiedOffer):
        return offer.estimated_payable or offer.visible_price
    return offer.visible_price


def _offer_block(item: RankedOffer | None) -> list[str]:
    if item is None:
        return ["暂无满足条件的候选。"]
    offer = item.offer
    lines = [
        f"- 商品：[{offer.title}]({offer.url})",
        f"- 平台：{offer.platform.value}",
        f"- 店铺：{offer.store_name or '页面未明确'}",
        f"- 匹配分：{item.score:.2f}",
    ]
    if isinstance(offer, VerifiedOffer):
        visible_price = (
            f"¥{offer.visible_price}"
            if offer.visible_price is not None
            else "未可靠提取"
        )
        lines.extend(
            [
                f"- SKU：{offer.sku or '页面未明确'}",
                f"- 页面展示价：{visible_price}",
            ]
        )
        if offer.estimated_payable is not None:
            lines.append(f"- 估算应付：¥{offer.estimated_payable}")
        if offer.coupon:
            lines.append(f"- 可见优惠：{offer.coupon}")
        if offer.conditions:
            lines.append(f"- 优惠条件：{'；'.join(offer.conditions)}")
        if offer.llm_summary:
            lines.append(f"- 优劣短评：{offer.llm_summary}")
        lines.extend(
            [
                f"- 复核时间：{offer.verified_at.isoformat()}",
                f"- 数据可信度：{offer.confidence.value}",
            ]
        )
    elif offer.visible_price is not None:
        lines.append(f"- 搜索页价格：¥{offer.visible_price}（未完成详情复核）")
    if item.unmet_requirements:
        lines.append(f"- 未满足：{'；'.join(item.unmet_requirements)}")
    return lines


def build_markdown_report(
    requirements: RequirementSet,
    ranked: list[RankedOffer],
) -> str:
    eligible = [item for item in ranked if item.hard_requirements_met]
    rejected = [item for item in ranked if not item.hard_requirements_met]
    best = eligible[0] if eligible else None
    lowest = min(
        eligible,
        key=lambda item: _display_price(item) or Decimal("Infinity"),
        default=None,
    )
    value = max(
        eligible,
        key=lambda item: item.score / float(_display_price(item) or Decimal("1")),
        default=None,
    )
    stretch = next(
        (
            item
            for item in ranked
            if requirements.budget_max is not None
            and _display_price(item) is not None
            and _display_price(item) > requirements.budget_max
            and item.hard_requirements_met
        ),
        None,
    )

    sections = [
        f"# DealBuddy 选品报告：{requirements.category}",
        "",
        f"需求版本：v{requirements.version}",
        "",
        (
            "> 价格来自页面可见信息。估算应付只计算页面明确展示且可直接解析的"
            "优惠，不代表结算价格。"
        ),
        "",
        "## 最符合需求",
        *_offer_block(best),
        "",
        "## 最低预算",
        *_offer_block(lowest),
        "",
        "## 综合性价比",
        *_offer_block(value),
        "",
        "## 值得加预算",
        *_offer_block(stretch),
        "",
        "## 不推荐项",
    ]
    if rejected:
        for item in rejected[:5]:
            sections.extend(_offer_block(item))
    else:
        sections.append("暂无明确不推荐项。")
    return "\n".join(sections).rstrip() + "\n"
