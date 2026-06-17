from __future__ import annotations

import http.client
import json
import threading
from http.server import HTTPServer
from typing import Any

from dealbuddy.intake import make_intake_handler
from dealbuddy.models import RequirementSet
from dealbuddy.session import SessionStore, ShoppingSession


def sample_payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "platform": "tmall",
        "url": "https://detail.tmall.com/item.htm?id=1",
        "title": "石头 P20",
        "visible_price": "3425.75",
        "store_name": "石头电器旗舰店",
        "sku_text": "上下水版",
        "specs": {"吸力": "18500Pa"},
        "ocr_text": "活水洗地",
        "confidence": "high",
    }
    payload.update(overrides)
    return payload


class IntakeTestServer:
    def __init__(self, store: SessionStore, session_id: str) -> None:
        handler = make_intake_handler(store, session_id)
        self.server = HTTPServer(("127.0.0.1", 0), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def port(self) -> int:
        return int(self.server.server_address[1])

    def request_with_headers(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> tuple[int, dict[str, str], str]:
        connection = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        payload = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json"} if body is not None else {}
        connection.request(method, path, body=payload, headers=headers)
        response = connection.getresponse()
        data = response.read().decode("utf-8")
        response_headers = dict(response.headers.items())
        connection.close()
        return response.status, response_headers, data

    def request(
        self,
        method: str,
        path: str,
        body: dict[str, Any] | None = None,
    ) -> tuple[int, str, str]:
        status, headers, data = self.request_with_headers(method, path, body)
        return status, headers.get("Content-Type", ""), data

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


def make_session(tmp_path) -> tuple[SessionStore, ShoppingSession]:
    store = SessionStore(tmp_path)
    session = ShoppingSession.new(RequirementSet(category="扫地机器人"))
    store.save(session)
    return store, session


def test_intake_server_health_offers_and_report(tmp_path) -> None:
    store, session = make_session(tmp_path)
    server = IntakeTestServer(store, session.session_id)
    try:
        status, content_type, body = server.request("GET", "/health")
        assert status == 200
        assert content_type.startswith("application/json")
        assert json.loads(body) == {"status": "ok", "session_id": session.session_id}

        status, content_type, body = server.request("POST", "/offers", sample_payload())
        assert status == 200
        assert content_type.startswith("application/json")
        assert json.loads(body)["verified_count"] == 1

        status, content_type, body = server.request("GET", "/report")
        assert status == 200
        assert content_type.startswith("text/markdown")
        assert "DealBuddy 选品报告" in body
    finally:
        server.close()


def test_intake_server_allows_private_network_preflight(tmp_path) -> None:
    store, session = make_session(tmp_path)
    server = IntakeTestServer(store, session.session_id)
    try:
        status, headers, _body = server.request_with_headers("OPTIONS", "/offers")

        assert status == 204
        assert headers["Access-Control-Allow-Origin"] == "*"
        assert headers["Access-Control-Allow-Private-Network"] == "true"
    finally:
        server.close()


def test_intake_server_returns_400_for_invalid_capture(tmp_path) -> None:
    store, session = make_session(tmp_path)
    server = IntakeTestServer(store, session.session_id)
    try:
        status, content_type, body = server.request(
            "POST",
            "/offers",
            sample_payload(platform="unknown", title=""),
        )

        assert status == 400
        assert content_type.startswith("application/json")
        assert "error" in json.loads(body)
    finally:
        server.close()
