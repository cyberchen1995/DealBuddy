from decimal import Decimal

from dealbuddy.models import ParameterCatalog, ParameterDefinition, RequirementSet
from dealbuddy.requirements import generate_clarifying_questions, merge_requirements


def test_questions_skip_known_conditions_and_stay_within_limit() -> None:
    requirements = RequirementSet(
        category="电视",
        raw_request="预算 5000 元以内，65 英寸，主要看电影",
        budget_max=Decimal("5000"),
        use_cases=["电影"],
        must_have={"screen_size": "65英寸"},
    )
    catalog = ParameterCatalog(
        category="电视",
        parameters=[
            ParameterDefinition(
                key="screen_size",
                name="屏幕尺寸",
                importance="key",
                common_values=["55英寸", "65英寸", "75英寸"],
            ),
            ParameterDefinition(
                key="panel_type",
                name="显示技术",
                importance="key",
                common_values=["Mini LED", "OLED"],
            ),
        ],
    )

    questions = generate_clarifying_questions(requirements, catalog, limit=10)

    assert 3 <= len(questions) <= 10
    assert all(
        question.dimension not in {"budget", "use_case", "screen_size"}
        for question in questions
    )
    assert any(question.dimension == "panel_type" for question in questions)


def test_merge_requirements_increments_version_and_preserves_existing_values() -> None:
    current = RequirementSet(
        category="电视",
        version=2,
        budget_max=Decimal("5000"),
        must_have={"screen_size": "65英寸"},
    )

    updated = merge_requirements(
        current,
        {
            "preferences": {"panel_type": "Mini LED"},
            "exclusions": ["开机广告"],
        },
    )

    assert updated.version == 3
    assert updated.budget_max == Decimal("5000")
    assert updated.must_have == {"screen_size": "65英寸"}
    assert updated.preferences["panel_type"] == "Mini LED"
    assert updated.exclusions == ["开机广告"]


def test_category_change_resets_category_specific_constraints() -> None:
    current = RequirementSet(
        category="电视",
        version=4,
        budget_max=Decimal("5000"),
        must_have={"screen_size": "65英寸"},
    )

    updated = merge_requirements(current, {"category": "扫地机器人"})

    assert updated.category == "扫地机器人"
    assert updated.version == 1
    assert updated.must_have == {}
    assert updated.budget_max is None
