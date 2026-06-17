from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def test_open_source_supporting_files_exist() -> None:
    required_paths = [
        "LICENSE",
        "CONTRIBUTING.md",
        "SECURITY.md",
        ".github/workflows/ci.yml",
        ".github/ISSUE_TEMPLATE/bug_report.md",
        ".github/ISSUE_TEMPLATE/feature_request.md",
        ".github/pull_request_template.md",
        "docs/THIRD_PARTY_ASSETS.md",
    ]

    missing = [path for path in required_paths if not (ROOT / path).exists()]

    assert missing == []


def test_gitignore_keeps_public_project_assets_trackable() -> None:
    gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
    gitignore_lines = set(gitignore.splitlines())

    assert "tests/" not in gitignore_lines
    assert "docs/" not in gitignore_lines
    assert "docs/superpowers/" in gitignore
    assert "uv.lock" not in gitignore_lines
    assert "参考/" in gitignore
    assert ".superpowers/" in gitignore
    assert ".dealbuddy/" in gitignore
    assert ".env" in gitignore


def test_readme_presents_web_as_primary_entrypoint() -> None:
    readme = (ROOT / "README.md").read_text(encoding="utf-8")

    assert "本地购物研究工具" in readme
    assert "DealBuddy 购物搭子" in readme
    assert 'src="docs/brand/dealbuddy-logo.svg"' in readme
    assert "uv run dealbuddy web --port 8765" in readme
    assert readme.index("uv run dealbuddy web --port 8765") < readme.index("## 工作流")
    assert "旧的" not in readme
    assert "仍旧" not in readme
    assert "仍然" not in readme
    assert "主使用路径" not in readme
    assert "MCP" in readme
    assert "Skill" in readme


def test_dealbuddy_skill_prefers_web_mcp_integration() -> None:
    skill = (ROOT / "skills/dealbuddy/SKILL.md").read_text(encoding="utf-8")
    command_contract = (
        ROOT / "skills/dealbuddy/references/command-contract.md"
    ).read_text(encoding="utf-8")

    assert "dealbuddy web --port 8765" in skill
    assert "POST http://127.0.0.1:8765/mcp" in command_contract
    assert "create_session" in skill
    assert "ask_session" in skill
    assert "dealbuddy intake" not in skill


def test_public_docs_do_not_include_local_user_paths() -> None:
    public_docs = [
        "README.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "docs/THIRD_PARTY_ASSETS.md",
        "skills/dealbuddy/SKILL.md",
        "skills/dealbuddy/references/command-contract.md",
    ]

    offenders = [
        path
        for path in public_docs
        if "/Users/" in (ROOT / path).read_text(encoding="utf-8")
    ]

    assert offenders == []


def test_public_docs_do_not_mention_local_reference_directory() -> None:
    public_docs = [
        "README.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
        "docs/THIRD_PARTY_ASSETS.md",
        "skills/dealbuddy/SKILL.md",
        "skills/dealbuddy/references/command-contract.md",
    ]

    offenders = [
        path
        for path in public_docs
        if "参考/" in (ROOT / path).read_text(encoding="utf-8")
    ]

    assert offenders == []
