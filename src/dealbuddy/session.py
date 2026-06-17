from __future__ import annotations

import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

from pydantic import BaseModel, Field

from dealbuddy.models import RequirementSet, SessionPhase
from dealbuddy.requirements import merge_requirements


class ShoppingSession(BaseModel):
    session_id: str
    requirements: RequirementSet
    phase: SessionPhase = SessionPhase.CREATED
    parameter_catalog: dict[str, Any] | None = None
    search_plan: dict[str, Any] | None = None
    candidates: list[dict[str, Any]] = Field(default_factory=list)
    verified_offers: list[dict[str, Any]] = Field(default_factory=list)
    report_markdown: str | None = None
    messages: list[dict[str, Any]] = Field(default_factory=list)
    pending_action: dict[str, Any] | None = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(UTC))

    @classmethod
    def new(cls, requirements: RequirementSet) -> ShoppingSession:
        return cls(session_id=uuid4().hex[:12], requirements=requirements)


class SessionStore:
    def __init__(self, root: Path | None = None) -> None:
        home = Path(os.environ.get("DEALBUDDY_HOME", Path.home() / ".dealbuddy"))
        self.root = root or home / "sessions"
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, session_id: str) -> Path:
        if not session_id.replace("-", "").isalnum():
            raise ValueError("Invalid session id")
        return self.root / f"{session_id}.json"

    def save(self, session: ShoppingSession) -> None:
        session.updated_at = datetime.now(UTC)
        path = self._path(session.session_id)
        temporary_path = path.with_suffix(".json.tmp")
        temporary_path.write_text(
            session.model_dump_json(indent=2),
            encoding="utf-8",
        )
        temporary_path.replace(path)

    def load(self, session_id: str) -> ShoppingSession:
        path = self._path(session_id)
        if not path.exists():
            raise FileNotFoundError(f"Unknown session: {session_id}")
        return ShoppingSession.model_validate_json(path.read_text(encoding="utf-8"))

    def list_sessions(self) -> list[ShoppingSession]:
        sessions = [
            ShoppingSession.model_validate_json(path.read_text(encoding="utf-8"))
            for path in self.root.glob("*.json")
            if not path.name.endswith(".tmp")
        ]
        return sorted(sessions, key=lambda session: session.updated_at)

    def refine(
        self,
        session_id: str,
        changes: dict[str, Any],
    ) -> ShoppingSession:
        session = self.load(session_id)
        old_category = session.requirements.category
        session.requirements = merge_requirements(session.requirements, changes)
        session.search_plan = None
        session.verified_offers = []
        session.report_markdown = None
        session.pending_action = None
        if session.requirements.category != old_category:
            session.parameter_catalog = None
            session.candidates = []
            session.phase = SessionPhase.CREATED
        else:
            session.phase = SessionPhase.READY_TO_SEARCH
        self.save(session)
        return session
