from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal

from pydantic import BaseModel, Field


def utc_now() -> datetime:
    return datetime.now(UTC)


class Platform(StrEnum):
    TAOBAO = "taobao"
    TMALL = "tmall"
    JD = "jd"


class Confidence(StrEnum):
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SessionPhase(StrEnum):
    CREATED = "created"
    RESEARCHING = "researching"
    CLARIFYING = "clarifying"
    READY_TO_SEARCH = "ready_to_search"
    SEARCHING = "searching"
    VERIFYING = "verifying"
    REPORTED = "reported"
    HUMAN_ACTION_REQUIRED = "human_action_required"
    TIMED_OUT = "timed_out"
    FAILED = "failed"


class ParameterDefinition(BaseModel):
    key: str
    name: str
    importance: Literal["key", "general", "marketing"]
    common_values: list[str] = Field(default_factory=list)
    description: str | None = None
    evidence_count: int = 0


class ParameterCatalog(BaseModel):
    category: str
    parameters: list[ParameterDefinition] = Field(default_factory=list)
    price_min: Decimal | None = None
    price_max: Decimal | None = None
    representative_models: list[str] = Field(default_factory=list)
    researched_at: datetime = Field(default_factory=utc_now)


class RequirementSet(BaseModel):
    category: str
    raw_request: str = ""
    version: int = Field(default=1, ge=1)
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    use_cases: list[str] = Field(default_factory=list)
    must_have: dict[str, str] = Field(default_factory=dict)
    preferences: dict[str, str] = Field(default_factory=dict)
    exclusions: list[str] = Field(default_factory=list)
    brands: list[str] = Field(default_factory=list)
    after_sales: list[str] = Field(default_factory=list)


class ClarifyingQuestion(BaseModel):
    dimension: str
    question: str
    options: list[str] = Field(default_factory=list)
    reason: str


class SearchPlan(BaseModel):
    category: str
    platform_keywords: dict[Platform, str]
    budget_min: Decimal | None = None
    budget_max: Decimal | None = None
    must_have: dict[str, str] = Field(default_factory=dict)
    preferences: dict[str, str] = Field(default_factory=dict)
    exclusions: list[str] = Field(default_factory=list)
    brands: list[str] = Field(default_factory=list)
    sort_by: Literal["relevance", "price", "sales"] = "relevance"
    candidate_limit_per_platform: int = Field(default=20, ge=1, le=20)
    verify_limit: int = Field(default=6, ge=1, le=6)
    result_pages: int = Field(default=2, ge=1, le=2)


class CandidateOffer(BaseModel):
    platform: Platform
    title: str
    url: str
    visible_price: Decimal | None = None
    sales_text: str | None = None
    review_count: int | None = None
    store_name: str | None = None
    brand: str | None = None
    model: str | None = None
    specs: dict[str, str] = Field(default_factory=dict)
    collected_at: datetime = Field(default_factory=utc_now)
    confidence: Confidence = Confidence.LOW


class VerifiedOffer(BaseModel):
    platform: Platform
    title: str
    url: str
    store_name: str | None = None
    brand: str | None = None
    model: str | None = None
    specs: dict[str, str] = Field(default_factory=dict)
    sku: str | None = None
    listed_price: Decimal | None = None
    visible_price: Decimal | None = None
    coupon: str | None = None
    estimated_payable: Decimal | None = None
    conditions: list[str] = Field(default_factory=list)
    stock: str | None = None
    parameters: dict[str, str] = Field(default_factory=dict)
    llm_summary: str | None = None
    verified_at: datetime = Field(default_factory=utc_now)
    confidence: Confidence = Confidence.MEDIUM


class RankedOffer(BaseModel):
    offer: CandidateOffer | VerifiedOffer
    score: float
    hard_requirements_met: bool
    matched_requirements: list[str] = Field(default_factory=list)
    unmet_requirements: list[str] = Field(default_factory=list)
    reasons: list[str] = Field(default_factory=list)
