from __future__ import annotations

from fastapi.testclient import TestClient

from dealbuddy.web import create_app


def rpc(method: str, params: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": method,
        "params": params or {},
    }


def test_mcp_rejects_untrusted_origin(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/mcp",
        headers={"Origin": "https://evil.example"},
        json=rpc("tools/list"),
    )

    assert response.status_code == 403


def test_mcp_rejects_localhost_lookalike_origin(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/mcp",
        headers={"Origin": "http://127.0.0.1.evil.example"},
        json=rpc("tools/list"),
    )

    assert response.status_code == 403


def test_mcp_lists_session_tools(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.post(
        "/mcp",
        headers={"Origin": "http://127.0.0.1:8765"},
        json=rpc("tools/list"),
    )

    assert response.status_code == 200
    tool_names = {tool["name"] for tool in response.json()["result"]["tools"]}
    assert {
        "create_session",
        "list_sessions",
        "show_session",
        "set_current_session",
        "add_offer",
        "refine_requirements",
        "get_report",
        "ask_session",
    }.issubset(tool_names)


def test_mcp_session_tool_flow_uses_local_analysis(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    headers = {"Origin": "http://localhost:8765"}

    created = client.post(
        "/mcp",
        headers=headers,
        json=rpc(
            "tools/call",
            {
                "name": "create_session",
                "arguments": {"category": "电视", "request": "预算5000，65英寸"},
            },
        ),
    )
    assert created.status_code == 200
    session_id = created.json()["result"]["structuredContent"]["session"]["session_id"]

    offered = client.post(
        "/mcp",
        headers=headers,
        json=rpc(
            "tools/call",
            {
                "name": "add_offer",
                "arguments": {
                    "session_id": session_id,
                    "offer": {
                        "platform": "jd",
                        "url": "https://item.jd.com/1.html",
                        "title": "TCL 65Q10K",
                        "visible_price": "4999",
                        "specs": {"背光": "Mini LED"},
                    },
                },
            },
        ),
    )
    assert offered.status_code == 200
    assert offered.json()["result"]["structuredContent"]["verified_count"] == 1

    answer = client.post(
        "/mcp",
        headers=headers,
        json=rpc(
            "tools/call",
            {
                "name": "ask_session",
                "arguments": {"session_id": session_id, "content": "怎么选？"},
            },
        ),
    )

    assert answer.status_code == 200
    content = answer.json()["result"]["structuredContent"]["messages"][-1]["content"]
    assert "本地规则" in content
