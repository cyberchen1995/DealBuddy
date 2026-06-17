import json

from typer.testing import CliRunner

from dealbuddy.cli import app


def test_start_and_refine_commands_persist_session(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    runner = CliRunner()

    started = runner.invoke(
        app,
        ["start", "--category", "电视", "--request", "预算5000，65英寸，主要看电影"],
    )

    assert started.exit_code == 0
    payload = json.loads(started.stdout)
    session_id = payload["session_id"]
    assert payload["requirements"]["budget_max"] == "5000"
    assert payload["requirements"]["must_have"]["screen_size"] == "65英寸"
    assert payload["requirements"]["use_cases"] == ["电影"]

    refined = runner.invoke(
        app,
        [
            "refine",
            session_id,
            "--changes",
            '{"budget_max": 5000, "must_have": {"screen_size": "65英寸"}}',
        ],
    )

    assert refined.exit_code == 0
    updated = json.loads(refined.stdout)
    assert updated["requirements"]["version"] == 2
    assert updated["phase"] == "ready_to_search"


def test_intake_command_exposes_port_option() -> None:
    runner = CliRunner()

    result = runner.invoke(app, ["intake", "--help"])

    assert result.exit_code == 0
    assert "--port" in result.stdout


def test_web_command_exposes_port_option() -> None:
    runner = CliRunner()

    result = runner.invoke(app, ["web", "--help"])

    assert result.exit_code == 0
    assert "--port" in result.stdout
