from decimal import Decimal

from dealbuddy.models import CandidateOffer, Platform, RequirementSet
from dealbuddy.ranking import rank_offers
from dealbuddy.search import build_search_plan


def test_search_plan_has_platform_keywords_and_limits() -> None:
    requirements = RequirementSet(
        category="电视",
        budget_max=Decimal("5000"),
        brands=["TCL", "海信"],
        must_have={"screen_size": "65英寸", "panel_type": "Mini LED"},
        exclusions=["样机"],
    )

    plan = build_search_plan(requirements)

    assert "65英寸" in plan.platform_keywords[Platform.JD]
    assert "Mini LED" in plan.platform_keywords[Platform.TAOBAO]
    assert plan.candidate_limit_per_platform == 20
    assert plan.verify_limit == 6


def test_ranking_prefers_requirement_match_over_slightly_lower_price() -> None:
    requirements = RequirementSet(
        category="电视",
        budget_max=Decimal("5000"),
        must_have={"screen_size": "65英寸", "panel_type": "Mini LED"},
    )
    matched = CandidateOffer(
        platform=Platform.JD,
        title="TCL 65英寸 Mini LED",
        url="https://item.jd.com/1.html",
        visible_price=Decimal("4599"),
        specs={"screen_size": "65英寸", "panel_type": "Mini LED"},
        store_name="京东自营",
        review_count=10000,
    )
    wrong_size = CandidateOffer(
        platform=Platform.TAOBAO,
        title="TCL 55英寸 Mini LED",
        url="https://item.taobao.com/item.htm?id=2",
        visible_price=Decimal("3999"),
        specs={"screen_size": "55英寸", "panel_type": "Mini LED"},
        store_name="品牌旗舰店",
        review_count=20000,
    )

    ranked = rank_offers([wrong_size, matched], requirements)

    assert ranked[0].offer.url == matched.url
    assert ranked[0].hard_requirements_met
    assert not ranked[1].hard_requirements_met


def test_brand_and_after_sales_restrictions_are_hard_requirements() -> None:
    requirements = RequirementSet(
        category="电视",
        brands=["TCL"],
        after_sales=["自营"],
    )
    official = CandidateOffer(
        platform=Platform.JD,
        title="TCL 65英寸电视",
        url="https://item.jd.com/1.html",
        visible_price=Decimal("4599"),
        brand="TCL",
        store_name="京东自营",
    )
    wrong_channel = CandidateOffer(
        platform=Platform.TAOBAO,
        title="海信 65英寸电视",
        url="https://item.taobao.com/item.htm?id=2",
        visible_price=Decimal("3999"),
        brand="海信",
        store_name="普通家电店",
    )

    ranked = rank_offers([wrong_channel, official], requirements)

    assert ranked[0].offer.url == official.url
    assert ranked[0].hard_requirements_met
    assert "品牌限制:TCL" in ranked[1].unmet_requirements
    assert "售后要求:自营" in ranked[1].unmet_requirements


def test_requirement_synonyms_match_real_product_titles() -> None:
    requirements = RequirementSet(
        category="茶吧机",
        must_have={
            "heating_type": "即热式",
            "sterilization": "UV杀菌",
            "temperature_control": "支持调温",
            "keep_warm": "保温",
        },
    )
    offer = CandidateOffer(
        platform=Platform.TAOBAO,
        title="小质即热速冷UV紫外杀菌多档调温恒温茶吧机",
        url="https://item.taobao.com/item.htm?id=1",
        visible_price=Decimal("1199"),
    )

    ranked = rank_offers([offer], requirements)

    assert ranked[0].hard_requirements_met
    assert ranked[0].unmet_requirements == []
