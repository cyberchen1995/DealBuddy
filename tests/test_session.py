from decimal import Decimal

from dealbuddy.models import RequirementSet, SessionPhase
from dealbuddy.session import SessionStore, ShoppingSession


def test_same_category_refinement_reuses_research_and_invalidates_report(
    tmp_path,
) -> None:
    store = SessionStore(tmp_path)
    session = ShoppingSession.new(
        RequirementSet(category="电视", budget_max=Decimal("5000"))
    )
    session.parameter_catalog = {"category": "电视", "parameters": []}
    session.phase = SessionPhase.REPORTED
    session.report_markdown = "old"
    store.save(session)

    updated = store.refine(session.session_id, {"budget_max": "4500"})

    assert updated.requirements.version == 2
    assert updated.parameter_catalog is not None
    assert updated.phase == SessionPhase.READY_TO_SEARCH
    assert updated.report_markdown is None


def test_category_change_clears_research_and_candidates(tmp_path) -> None:
    store = SessionStore(tmp_path)
    session = ShoppingSession.new(RequirementSet(category="电视"))
    session.parameter_catalog = {"category": "电视", "parameters": []}
    session.candidates = [{"url": "https://example.com"}]
    store.save(session)

    updated = store.refine(session.session_id, {"category": "扫地机器人"})

    assert updated.requirements.version == 1
    assert updated.parameter_catalog is None
    assert updated.candidates == []
    assert updated.phase == SessionPhase.CREATED
