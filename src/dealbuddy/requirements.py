from __future__ import annotations

import re
from collections.abc import Mapping
from decimal import Decimal
from typing import Any

from dealbuddy.models import (
    ClarifyingQuestion,
    ParameterCatalog,
    RequirementSet,
)

_FALLBACK_QUESTIONS = [
    ClarifyingQuestion(
        dimension="budget",
        question="你的可接受预算区间是多少？",
        reason="预算会直接改变可选型号和优惠判断。",
    ),
    ClarifyingQuestion(
        dimension="use_case",
        question="主要使用场景是什么？",
        reason="使用场景决定哪些参数是真正的硬指标。",
    ),
    ClarifyingQuestion(
        dimension="brand",
        question="有偏好的品牌，或明确不考虑的品牌吗？",
        reason="品牌偏好会影响搜索范围、售后和溢价。",
    ),
    ClarifyingQuestion(
        dimension="after_sales",
        question="对自营、官方旗舰店、安装或保修有什么硬性要求？",
        reason="渠道和售后会影响最终购买风险。",
    ),
    ClarifyingQuestion(
        dimension="size",
        question="尺寸、容量或安装空间有什么限制？",
        reason="尺寸类限制通常无法通过降价来妥协。",
    ),
    ClarifyingQuestion(
        dimension="usage_frequency",
        question="预计使用频率和使用年限是多少？",
        reason="使用强度会改变耐用性和加预算的价值。",
    ),
    ClarifyingQuestion(
        dimension="tradeoff",
        question="价格、性能、体验和售后中，你最看重哪两项？",
        reason="明确取舍后才能区分最低价与综合性价比。",
    ),
]


def initial_requirements(category: str, request: str) -> RequirementSet:
    data: dict[str, object] = {"category": category, "raw_request": request}
    budget = re.search(r"(?:预算|不超过|以内)\D{0,8}(\d+(?:\.\d+)?)", request)
    if budget:
        data["budget_max"] = Decimal(budget.group(1))
    size = re.search(r"(\d+(?:\.\d+)?)\s*(英寸|吋|寸)", request)
    if size:
        data["must_have"] = {"screen_size": f"{size.group(1)}英寸"}
    use_cases = [
        label
        for label, markers in {
            "电影": ("电影", "观影", "追剧", "看剧"),
            "游戏": ("游戏", "主机", "电竞"),
            "办公": ("办公", "生产力", "会议"),
            "学习": ("学习", "网课"),
            "老人": ("老人", "长辈", "父母"),
            "儿童": ("儿童", "孩子", "宝宝"),
        }.items()
        if any(marker in request for marker in markers)
    ]
    if use_cases:
        data["use_cases"] = use_cases
    return RequirementSet.model_validate(data)


def _known_dimensions(requirements: RequirementSet) -> set[str]:
    known = set(requirements.must_have) | set(requirements.preferences)
    if requirements.budget_min is not None or requirements.budget_max is not None:
        known.add("budget")
    if requirements.use_cases:
        known.add("use_case")
    if requirements.brands:
        known.add("brand")
    if requirements.after_sales:
        known.add("after_sales")
    return known


def generate_clarifying_questions(
    requirements: RequirementSet,
    catalog: ParameterCatalog,
    *,
    limit: int = 10,
) -> list[ClarifyingQuestion]:
    max_questions = min(max(limit, 3), 10)
    known = _known_dimensions(requirements)
    questions: list[ClarifyingQuestion] = []

    importance_order = {"key": 0, "general": 1, "marketing": 2}
    parameters = sorted(
        catalog.parameters,
        key=lambda item: (importance_order[item.importance], -item.evidence_count),
    )
    for parameter in parameters:
        if parameter.key in known or parameter.importance == "marketing":
            continue
        questions.append(
            ClarifyingQuestion(
                dimension=parameter.key,
                question=f"关于{parameter.name}，你有什么必须满足或偏好的要求？",
                options=parameter.common_values[:5],
                reason=f"{parameter.name}是该品类中常见的差异参数。",
            )
        )
        known.add(parameter.key)
        if len(questions) >= max_questions:
            return questions

    for question in _FALLBACK_QUESTIONS:
        if question.dimension in known:
            continue
        questions.append(question.model_copy(deep=True))
        known.add(question.dimension)
        if len(questions) >= max_questions:
            break

    return questions


def _merge_unique(existing: list[str], incoming: object) -> list[str]:
    if incoming is None:
        return existing
    values = incoming if isinstance(incoming, list) else [incoming]
    return list(dict.fromkeys([*existing, *(str(value) for value in values if value)]))


def merge_requirements(
    current: RequirementSet,
    changes: Mapping[str, Any],
) -> RequirementSet:
    new_category = str(changes.get("category", current.category)).strip()
    if new_category != current.category:
        reset_data: dict[str, Any] = {
            "category": new_category,
            "raw_request": str(changes.get("raw_request", "")),
            "version": 1,
        }
        for field in (
            "budget_min",
            "budget_max",
            "use_cases",
            "must_have",
            "preferences",
            "exclusions",
            "brands",
            "after_sales",
        ):
            if field in changes:
                reset_data[field] = changes[field]
        return RequirementSet.model_validate(reset_data)

    data = current.model_dump()
    data["version"] = current.version + 1
    for mapping_field in ("must_have", "preferences"):
        if mapping_field in changes:
            data[mapping_field] = {
                **data[mapping_field],
                **dict(changes[mapping_field] or {}),
            }
    for list_field in ("use_cases", "exclusions", "brands", "after_sales"):
        if list_field in changes:
            data[list_field] = _merge_unique(data[list_field], changes[list_field])
    for scalar_field in ("raw_request", "budget_min", "budget_max"):
        if scalar_field in changes:
            data[scalar_field] = changes[scalar_field]
    return RequirementSet.model_validate(data)
