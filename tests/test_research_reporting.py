from decimal import Decimal

from dealbuddy.models import (
    Confidence,
    Platform,
    RequirementSet,
    VerifiedOffer,
)
from dealbuddy.ranking import rank_offers
from dealbuddy.reporting import build_markdown_report
from dealbuddy.research import build_parameter_catalog


def verified_offer(
    *,
    title: str,
    price: str,
    parameters: dict[str, str],
    coupon: str | None = None,
    estimated: str | None = None,
    llm_summary: str | None = None,
) -> VerifiedOffer:
    return VerifiedOffer(
        platform=Platform.JD,
        title=title,
        url=f"https://item.jd.com/{abs(hash(title))}.html",
        store_name="京东自营",
        visible_price=Decimal(price),
        estimated_payable=Decimal(estimated) if estimated else None,
        coupon=coupon,
        conditions=[coupon] if coupon else [],
        parameters=parameters,
        specs={
            "screen_size": parameters["屏幕尺寸"],
            "panel_type": parameters["显示技术"],
        },
        llm_summary=llm_summary,
        confidence=Confidence.HIGH,
    )


def test_parameter_catalog_groups_common_values_and_price_range() -> None:
    offers = [
        verified_offer(
            title="电视 A",
            price="3999",
            parameters={
                "屏幕尺寸": "65英寸",
                "显示技术": "Mini LED",
                "刷新率": "144Hz",
                "AI画质": "支持",
            },
        ),
        verified_offer(
            title="电视 B",
            price="4599",
            parameters={
                "屏幕尺寸": "65英寸",
                "显示技术": "OLED",
                "刷新率": "120Hz",
                "AI画质": "大师调校",
            },
        ),
    ]

    catalog = build_parameter_catalog("电视", offers)

    assert catalog.price_min == Decimal("3999")
    assert catalog.price_max == Decimal("4599")
    by_name = {parameter.name: parameter for parameter in catalog.parameters}
    assert by_name["屏幕尺寸"].importance == "key"
    assert by_name["显示技术"].common_values == ["Mini LED", "OLED"]
    assert by_name["AI画质"].importance == "marketing"


def test_report_labels_estimated_price_and_includes_required_sections() -> None:
    requirements = RequirementSet(
        category="电视",
        budget_max=Decimal("5000"),
        must_have={"screen_size": "65英寸"},
    )
    offers = [
        verified_offer(
            title="电视 A",
            price="4599",
            estimated="4299",
            coupon="满4000减300",
            parameters={"屏幕尺寸": "65英寸", "显示技术": "Mini LED"},
        ),
        verified_offer(
            title="电视 B",
            price="3999",
            parameters={"屏幕尺寸": "55英寸", "显示技术": "Mini LED"},
        ),
    ]

    report = build_markdown_report(requirements, rank_offers(offers, requirements))

    assert "最符合需求" in report
    assert "最低预算" in report
    assert "综合性价比" in report
    assert "值得加预算" in report
    assert "不推荐项" in report
    assert "估算应付：¥4299" in report
    assert "不代表结算价格" in report


def test_report_includes_llm_offer_summary_when_available() -> None:
    requirements = RequirementSet(
        category="电视",
        budget_max=Decimal("5000"),
        must_have={"screen_size": "65英寸"},
    )
    offers = [
        verified_offer(
            title="电视 A",
            price="4599",
            parameters={"屏幕尺寸": "65英寸", "显示技术": "Mini LED"},
            llm_summary="亮度高适合电影，系统广告偏多",
        )
    ]

    report = build_markdown_report(requirements, rank_offers(offers, requirements))

    assert "优劣短评：亮度高适合电影，系统广告偏多" in report
