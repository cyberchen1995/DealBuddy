from __future__ import annotations

import os
from pathlib import Path

from pydantic import BaseModel, Field


class LLMSettings(BaseModel):
    enabled: bool = False
    provider_name: str = "openai-compatible"
    base_url: str = ""
    model: str = ""
    api_key: str = ""

    @property
    def configured(self) -> bool:
        return bool(self.enabled and self.base_url and self.model and self.api_key)


class DealBuddyConfig(BaseModel):
    current_session_id: str | None = None
    llm: LLMSettings = Field(default_factory=LLMSettings)


def dealbuddy_home() -> Path:
    return Path(os.environ.get("DEALBUDDY_HOME", Path.home() / ".dealbuddy"))


def mask_api_key(value: str) -> str | None:
    if not value:
        return None
    if len(value) <= 8:
        return "*" * len(value)
    return f"{value[:4]}...{value[-4:]}"


class ConfigStore:
    def __init__(self, root: Path | None = None) -> None:
        self.root = root or dealbuddy_home()
        self.root.mkdir(parents=True, exist_ok=True)
        self.path = self.root / "config.json"

    def load(self) -> DealBuddyConfig:
        if not self.path.exists():
            return DealBuddyConfig()
        return DealBuddyConfig.model_validate_json(
            self.path.read_text(encoding="utf-8")
        )

    def save(self, config: DealBuddyConfig) -> DealBuddyConfig:
        temporary_path = self.path.with_suffix(".json.tmp")
        temporary_path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
        temporary_path.replace(self.path)
        return config

    def public_llm_status(self) -> dict[str, object]:
        llm = self.load().llm
        return {
            "enabled": llm.enabled,
            "configured": llm.configured,
            "provider_name": llm.provider_name,
            "base_url": llm.base_url,
            "model": llm.model,
            "api_key_set": bool(llm.api_key),
            "api_key_preview": mask_api_key(llm.api_key),
        }
