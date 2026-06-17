from __future__ import annotations

from dealbuddy.models import Platform, RequirementSet, SearchPlan


def _keyword_parts(requirements: RequirementSet) -> list[str]:
    parts = [requirements.category]
    if len(requirements.brands) == 1:
        parts.extend(requirements.brands)
    parts.extend(str(value) for value in requirements.must_have.values())
    return list(dict.fromkeys(part.strip() for part in parts if part and part.strip()))


def build_search_plan(requirements: RequirementSet) -> SearchPlan:
    keywords = " ".join(_keyword_parts(requirements))
    return SearchPlan(
        category=requirements.category,
        platform_keywords={
            Platform.TAOBAO: keywords,
            Platform.JD: keywords,
        },
        budget_min=requirements.budget_min,
        budget_max=requirements.budget_max,
        must_have=requirements.must_have,
        preferences=requirements.preferences,
        exclusions=requirements.exclusions,
        brands=requirements.brands,
    )
