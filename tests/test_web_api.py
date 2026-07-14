from __future__ import annotations

import json
from contextlib import AbstractContextManager
from types import TracebackType

from fastapi.testclient import TestClient

from dealbuddy.session import SessionStore
from dealbuddy.web import create_app


class FakeLLMResponse(AbstractContextManager["FakeLLMResponse"]):
    def __init__(self, payload: dict[str, object]) -> None:
        self.payload = payload

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None

    def read(self) -> bytes:
        return json.dumps(self.payload, ensure_ascii=False).encode("utf-8")


class FakeStreamingLLMResponse(AbstractContextManager["FakeStreamingLLMResponse"]):
    def __init__(self, lines: list[str]) -> None:
        self.lines = [line.encode("utf-8") for line in lines]

    def __exit__(
        self,
        exc_type: type[BaseException] | None,
        exc_value: BaseException | None,
        traceback: TracebackType | None,
    ) -> None:
        return None

    def readline(self) -> bytes:
        if not self.lines:
            return b""
        return self.lines.pop(0)


def sample_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "platform": "tmall",
        "url": "https://detail.tmall.com/item.htm?id=web-1",
        "title": "海信 65E7N Pro",
        "visible_price": "4599",
        "store_name": "海信官方旗舰店",
        "sku_text": "65英寸",
        "specs": {"刷新率": "144Hz", "背光": "Mini LED"},
        "ocr_text": "Mini LED 电视 144Hz",
        "confidence": "high",
    }
    payload.update(overrides)
    return payload


def test_web_api_creates_current_session_and_accepts_current_offer(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    created = client.post(
        "/api/sessions",
        json={
            "category": "电视",
            "request": "预算5000以内，65英寸，主要看电影",
        },
    )
    assert created.status_code == 200
    created_payload = created.json()
    session_id = created_payload["session"]["session_id"]
    assert created_payload["current_session_id"] == session_id

    listed = client.get("/api/sessions")
    assert listed.status_code == 200
    assert listed.json()["current_session_id"] == session_id
    assert [item["session_id"] for item in listed.json()["sessions"]] == [session_id]

    offered = client.post("/api/current/offers", json=sample_payload())
    assert offered.status_code == 200
    assert offered.json()["verified_count"] == 1

    shown = client.get(f"/api/sessions/{session_id}")
    assert shown.status_code == 200
    session = shown.json()["session"]
    assert len(session["verified_offers"]) == 1
    assert "DealBuddy 选品报告" in session["report_markdown"]


def test_web_current_offer_allows_extension_private_network_preflight(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.options(
        "/api/current/offers",
        headers={
            "Origin": "https://item.jd.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )

    assert response.status_code == 204
    assert response.headers["Access-Control-Allow-Origin"] == "https://item.jd.com"
    assert response.headers["Access-Control-Allow-Methods"] == "GET,POST,OPTIONS"
    assert response.headers["Access-Control-Allow-Headers"] == "Content-Type"
    assert response.headers["Access-Control-Allow-Private-Network"] == "true"


def test_web_current_offer_does_not_allow_lookalike_ecommerce_origin(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.options(
        "/api/current/offers",
        headers={
            "Origin": "https://eviltaobao.com",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
            "Access-Control-Request-Private-Network": "true",
        },
    )

    assert response.status_code == 204
    assert "Access-Control-Allow-Origin" not in response.headers


def test_web_legacy_offers_path_posts_to_current_session(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "预算5000"},
    ).json()["session"]["session_id"]

    response = client.post(
        "/offers",
        headers={"Origin": "https://detail.tmall.com"},
        json=sample_payload(),
    )

    assert response.status_code == 200
    assert response.headers["Access-Control-Allow-Origin"] == "https://detail.tmall.com"
    assert response.json()["verified_count"] == 1
    shown = client.get(f"/api/sessions/{session_id}")
    assert len(shown.json()["session"]["verified_offers"]) == 1


def test_web_can_delete_session_offer_and_rebuild_report(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "预算5000"},
    ).json()["session"]["session_id"]
    client.post("/api/current/offers", json=sample_payload(title="海信 65E7N Pro"))
    client.post(
        "/api/current/offers",
        json=sample_payload(
            url="https://item.jd.com/web-2.html",
            platform="jd",
            title="TCL Q10",
        ),
    )

    deleted = client.delete(f"/api/sessions/{session_id}/offers/0")

    assert deleted.status_code == 200
    assert deleted.json()["verified_count"] == 1
    shown = client.get(f"/api/sessions/{session_id}")
    session = shown.json()["session"]
    assert [offer["title"] for offer in session["verified_offers"]] == ["TCL Q10"]
    assert "TCL Q10" in session["report_markdown"]
    assert "海信 65E7N Pro" not in session["report_markdown"]


def test_web_chat_uses_local_fallback_and_persists_messages(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "扫地机器人", "request": "预算 3000，避障好"},
    ).json()["session"]["session_id"]
    client.post("/api/current/offers", json=sample_payload(title="石头 P20"))

    response = client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "这几个怎么选？"},
    )

    assert response.status_code == 200
    messages = response.json()["messages"]
    assert [message["role"] for message in messages] == ["user", "assistant"]
    assert "本地规则" in messages[-1]["content"]
    reloaded = SessionStore().load(session_id)
    assert [message["role"] for message in reloaded.messages] == ["user", "assistant"]


def test_web_chat_streams_llm_delta_chunks_and_persists_messages(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    seen_payload: dict[str, object] = {}

    def fake_urlopen(request: object, timeout: int) -> FakeStreamingLLMResponse:
        seen_payload.update(json.loads(request.data.decode("utf-8")))
        return FakeStreamingLLMResponse(
            [
                'data: {"choices":[{"delta":{"content":"先看亮度"}}]}\n\n',
                'data: {"choices":[{"delta":{"content":"，再看接口"}}]}\n\n',
                "data: [DONE]\n\n",
            ]
        )

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", fake_urlopen)
    monkeypatch.setattr("dealbuddy.web._run_in_background", lambda task: task())
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "主要连接 NAS 使用"},
    ).json()["session"]["session_id"]
    client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1/chat/completions",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )

    with client.stream(
        "POST",
        f"/api/sessions/{session_id}/messages/stream",
        json={"content": "怎么选？"},
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert seen_payload["stream"] is True
    assert "event: user" in body
    assert "event: delta" in body
    assert "先看亮度" in body
    assert "，再看接口" in body
    assert "event: done" in body
    reloaded = SessionStore().load(session_id)
    assert [message["role"] for message in reloaded.messages] == ["user", "assistant"]
    assert reloaded.messages[-1]["source"] == "llm"
    assert reloaded.messages[-1]["content"] == "先看亮度，再看接口"


def test_web_regenerates_report_with_conversation_and_increments_version(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "预算5000，65英寸"},
    ).json()["session"]["session_id"]
    client.post("/api/current/offers", json=sample_payload(title="TCL Q10"))
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "主要连接 NAS 使用，自建了 Emby 影视库"},
    )

    response = client.post(f"/api/sessions/{session_id}/report/regenerate")

    assert response.status_code == 200
    session = response.json()["session"]
    assert session["requirements"]["version"] == 2
    assert "需求版本：v2" in session["report_markdown"]
    assert "主要连接 NAS 使用，自建了 Emby 影视库" in session["report_markdown"]


def test_web_regenerate_report_sends_conversation_to_llm(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    seen_payload: dict[str, object] = {}

    def fake_urlopen(request: object, timeout: int) -> FakeLLMResponse:
        payload = json.loads(request.data.decode("utf-8"))
        messages = payload.get("messages") or []
        user_content = messages[-1]["content"]
        if "report_markdown" in user_content:
            seen_payload.update(payload)
            return FakeLLMResponse(
                {
                    "choices": [
                        {
                            "message": {
                                "content": (
                                    "# LLM 报告\n\n"
                                    "结合 NAS 和 Emby 后，建议优先看接口。"
                                )
                            }
                        }
                    ]
                }
            )
        return FakeLLMResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "summaries": [
                                        {
                                            "url": "https://detail.tmall.com/item.htm?id=web-1",
                                            "summary": "高刷适合游戏，接口一般",
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }
        )

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", fake_urlopen)
    monkeypatch.setattr("dealbuddy.web._run_in_background", lambda task: task())
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "预算5000，65英寸"},
    ).json()["session"]["session_id"]
    client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1/chat/completions",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )
    client.post("/api/current/offers", json=sample_payload(title="TCL Q10"))
    client.post(
        f"/api/sessions/{session_id}/messages",
        json={"content": "主要连接 NAS 使用，自建了 Emby 影视库"},
    )

    response = client.post(f"/api/sessions/{session_id}/report/regenerate")

    assert response.status_code == 200
    session = response.json()["session"]
    assert session["requirements"]["version"] == 2
    assert "结合 NAS 和 Emby" in session["report_markdown"]
    assert "需求版本：v2" in session["report_markdown"]
    assert "不代表结算价格" in session["report_markdown"]
    llm_request = json.loads(seen_payload["messages"][-1]["content"])
    assert llm_request["messages"][-2]["content"] == (
        "主要连接 NAS 使用，自建了 Emby 影视库"
    )


def test_web_llm_settings_are_saved_but_api_key_is_masked(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    saved = client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1/chat/completions",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )
    assert saved.status_code == 200
    payload = saved.json()
    assert payload["configured"] is True
    assert payload["api_key_set"] is True
    assert "sk-test-secret" not in json.dumps(payload)

    status = client.get("/api/settings/llm")
    assert status.status_code == 200
    assert status.json()["api_key_preview"] == "sk-t...cret"
    assert "api_key" not in status.json()

    updated = client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1/chat/completions",
            "model": "gpt-test-v2",
            "api_key": "",
        },
    )

    assert updated.status_code == 200
    assert updated.json()["configured"] is True
    assert updated.json()["model"] == "gpt-test-v2"
    assert updated.json()["api_key_preview"] == "sk-t...cret"


def test_web_adds_llm_offer_summary_to_offer_and_report(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))

    def fake_urlopen(request: object, timeout: int) -> FakeLLMResponse:
        return FakeLLMResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "summaries": [
                                        {
                                            "url": "https://detail.tmall.com/item.htm?id=web-1",
                                            "summary": "高刷适合游戏，音质一般",
                                        }
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }
        )

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", fake_urlopen)
    monkeypatch.setattr("dealbuddy.web._run_in_background", lambda task: task())
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "电视", "request": "预算5000，游戏和电影"},
    ).json()["session"]["session_id"]
    client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1/chat/completions",
            "model": "gpt-test",
            "api_key": "sk-test-secret",
        },
    )

    offered = client.post("/api/current/offers", json=sample_payload())

    assert offered.status_code == 200
    session = client.get(f"/api/sessions/{session_id}").json()["session"]
    assert session["verified_offers"][0]["llm_summary"] == "高刷适合游戏，音质一般"
    assert "优劣短评：高刷适合游戏，音质一般" in session["report_markdown"]


def test_web_serves_static_workbench(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())

    response = client.get("/")

    assert response.status_code == 200
    assert "DealBuddy 工作台" in response.text
    assert "/messages/stream" in response.text
    assert "/report/regenerate" in response.text
    assert "state.sessions = state.sessions.map" in response.text


def test_llm_endpoint_normalizes_partial_base_urls() -> None:
    from dealbuddy.config import LLMSettings
    from dealbuddy.web import _llm_endpoint

    def settings(url: str) -> LLMSettings:
        return LLMSettings(enabled=True, base_url=url, model="m", api_key="k")

    assert (
        _llm_endpoint(settings("https://api.example.test/v1/chat/completions"))
        == "https://api.example.test/v1/chat/completions"
    )
    assert (
        _llm_endpoint(settings("https://api.example.test/v1/"))
        == "https://api.example.test/v1/chat/completions"
    )
    assert (
        _llm_endpoint(settings("https://api.example.test"))
        == "https://api.example.test/v1/chat/completions"
    )


def test_web_llm_connection_test_reports_success_and_refused(
    tmp_path,
    monkeypatch,
) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    draft = {
        "provider_name": "openai-compatible",
        "base_url": "https://api.example.test/v1",
        "model": "gpt-test",
        "api_key": "sk-test-secret",
    }

    def ok_urlopen(request: object, timeout: int) -> FakeLLMResponse:
        assert request.full_url == "https://api.example.test/v1/chat/completions"
        return FakeLLMResponse({"choices": [{"message": {"content": "pong"}}]})

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", ok_urlopen)
    success = client.post("/api/settings/llm/test", json=draft).json()
    assert success["ok"] is True
    assert success["endpoint"] == "https://api.example.test/v1/chat/completions"

    from urllib.error import URLError

    def refused_urlopen(request: object, timeout: int) -> FakeLLMResponse:
        raise URLError(ConnectionRefusedError(61, "Connection refused"))

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", refused_urlopen)
    refused = client.post("/api/settings/llm/test", json=draft).json()
    assert refused["ok"] is False
    assert "连接被拒绝" in refused["message"]

    missing = client.post("/api/settings/llm/test", json={}).json()
    assert missing["ok"] is False
    assert "缺少配置" in missing["message"]


def test_llm_endpoint_preserves_query_and_custom_paths() -> None:
    from dealbuddy.config import LLMSettings
    from dealbuddy.web import _llm_endpoint

    def endpoint(url: str) -> str:
        return _llm_endpoint(
            LLMSettings(enabled=True, base_url=url, model="m", api_key="k")
        )

    # /v1 结尾带 query：只补 path，query 原样保留
    assert (
        endpoint("https://host.test/v1?api-version=1")
        == "https://host.test/v1/chat/completions?api-version=1"
    )
    # 自建网关自定义路径：逐字保留，不被改写
    assert endpoint("https://gw.test/llm") == "https://gw.test/llm"
    # 完整端点：保持不变
    assert (
        endpoint("https://host.test/v1/chat/completions")
        == "https://host.test/v1/chat/completions"
    )


def test_llm_connection_test_rejects_untrusted_origin(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    response = client.post(
        "/api/settings/llm/test",
        headers={"Origin": "https://detail.tmall.com"},
        json={
            "base_url": "http://attacker.example",
            "model": "gpt",
            "api_key": "sk-x",
        },
    )
    assert response.status_code == 403


def test_offer_not_lost_when_posted_during_background_summary(
    tmp_path,
    monkeypatch,
) -> None:
    import threading

    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    started = threading.Event()
    release = threading.Event()

    def fake_urlopen(request: object, timeout: int) -> FakeLLMResponse:
        started.set()
        release.wait(timeout=5)
        return FakeLLMResponse(
            {
                "choices": [
                    {
                        "message": {
                            "content": json.dumps(
                                {
                                    "summaries": [
                                        {
                                            "url": "https://item.jd.com/A.html",
                                            "summary": "A 短评",
                                        },
                                        {
                                            "url": "https://item.jd.com/B.html",
                                            "summary": "B 短评",
                                        },
                                    ]
                                },
                                ensure_ascii=False,
                            )
                        }
                    }
                ]
            }
        )

    monkeypatch.setattr("dealbuddy.web.urlrequest.urlopen", fake_urlopen)
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "扫地机器人", "request": "预算4000"},
    ).json()["session"]["session_id"]
    client.post(
        "/api/settings/llm",
        json={
            "enabled": True,
            "provider_name": "openai-compatible",
            "base_url": "https://api.example.test/v1",
            "model": "gpt-test",
            "api_key": "sk-test",
        },
    )

    # 采集 A -> 后台摘要线程启动并阻塞在 LLM 调用
    client.post(
        "/api/current/offers",
        json=sample_payload(url="https://item.jd.com/A.html", platform="jd", title="A"),
    )
    assert started.wait(timeout=5)

    # LLM 仍在进行中，采集 B（前台保存 A+B）
    posted_b = client.post(
        "/api/current/offers",
        json=sample_payload(url="https://item.jd.com/B.html", platform="jd", title="B"),
    )
    assert posted_b.json()["verified_count"] == 2

    # 放行后台线程完成写回，等待其落盘
    release.set()
    deadline = __import__("time").monotonic() + 5
    while __import__("time").monotonic() < deadline:
        offers = client.get(f"/api/sessions/{session_id}").json()["session"][
            "verified_offers"
        ]
        if all(o.get("llm_summary") for o in offers) and len(offers) == 2:
            break
        __import__("time").sleep(0.05)

    session = client.get(f"/api/sessions/{session_id}").json()["session"]
    titles = sorted(o["title"] for o in session["verified_offers"])
    # 旧实现下 A 的后台线程会用只含 A 的陈旧快照覆盖，B 会丢失 -> 断言 B 仍在
    assert titles == ["A", "B"]
    assert all(o.get("llm_summary") for o in session["verified_offers"])


def test_two_phase_capture_reposts_same_url_and_updates_in_place(
    tmp_path,
    monkeypatch,
) -> None:
    # 扩展先送达基础商品（无 OCR），OCR 完成后带 ocr_text 再次 POST 同一 URL。
    monkeypatch.setenv("DEALBUDDY_HOME", str(tmp_path))
    client = TestClient(create_app())
    session_id = client.post(
        "/api/sessions",
        json={"category": "扫地机器人", "request": "预算4000"},
    ).json()["session"]["session_id"]

    base = sample_payload(url="https://item.jd.com/x.html", platform="jd", title="X")
    base.pop("ocr_text", None)
    first = client.post("/api/current/offers", json=base)
    assert first.json()["verified_count"] == 1

    enriched = dict(base, ocr_text="36000Pa 自动集尘 全年免维护")
    second = client.post("/api/current/offers", json=enriched)
    assert second.json()["verified_count"] == 1  # 同 URL 覆盖，不新增

    session = client.get(f"/api/sessions/{session_id}").json()["session"]
    assert len(session["verified_offers"]) == 1
    assert session["verified_offers"][0]["parameters"]["ocr_text"].startswith("36000Pa")
