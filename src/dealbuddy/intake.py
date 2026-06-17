from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from pydantic import BaseModel, Field, ValidationError, field_validator
from pydantic_core import to_jsonable_python

from dealbuddy.models import Confidence, Platform, VerifiedOffer
from dealbuddy.ranking import rank_offers
from dealbuddy.reporting import build_markdown_report
from dealbuddy.session import SessionStore, ShoppingSession


class CapturePayload(BaseModel):
    platform: Platform
    url: str
    title: str
    visible_price: str | Decimal | None = None
    store_name: str | None = None
    sku_id: str | None = None
    sku_text: str | None = None
    selected_sku_text: str | None = None
    specs: dict[str, str] = Field(default_factory=dict)
    ocr_text: str | None = None
    confidence: Confidence = Confidence.MEDIUM

    @field_validator("url", "title")
    @classmethod
    def require_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("must not be blank")
        return normalized


def parse_visible_price(value: str | Decimal | None) -> Decimal | None:
    if isinstance(value, Decimal):
        return value
    if value is None:
        return None
    match = re.search(r"\d+(?:\.\d+)?", str(value).replace(",", ""))
    if not match:
        return None
    try:
        return Decimal(match.group(0))
    except InvalidOperation:
        return None


def capture_to_verified_offer(capture: CapturePayload) -> VerifiedOffer:
    visible_price = parse_visible_price(capture.visible_price)
    parameters = {}
    if capture.sku_id:
        parameters["sku_id"] = capture.sku_id
    if capture.ocr_text:
        parameters["ocr_text"] = capture.ocr_text
    return VerifiedOffer(
        platform=capture.platform,
        title=capture.title,
        url=capture.url,
        store_name=capture.store_name,
        specs=capture.specs,
        sku=capture.sku_text or capture.selected_sku_text,
        visible_price=visible_price,
        estimated_payable=visible_price,
        parameters=parameters,
        confidence=capture.confidence,
    )


def add_capture_to_session(
    store: SessionStore,
    session_id: str,
    capture: CapturePayload,
) -> ShoppingSession:
    session = store.load(session_id)
    offer = capture_to_verified_offer(capture)
    offer_data = offer.model_dump(mode="json")
    session.verified_offers = [
        item for item in session.verified_offers if item.get("url") != capture.url
    ]
    session.verified_offers.append(offer_data)
    rebuild_session_report(session)
    store.save(session)
    return session


def rebuild_session_report(session: ShoppingSession) -> None:
    verified = [VerifiedOffer.model_validate(item) for item in session.verified_offers]
    session.report_markdown = (
        build_markdown_report(
            session.requirements,
            rank_offers(verified, session.requirements),
        )
        if verified
        else None
    )


def _json_bytes(payload: object) -> bytes:
    return json.dumps(
        to_jsonable_python(payload),
        ensure_ascii=False,
        indent=2,
    ).encode("utf-8")


def make_intake_handler(
    store: SessionStore,
    session_id: str,
) -> type[BaseHTTPRequestHandler]:
    class IntakeHandler(BaseHTTPRequestHandler):
        server_version = "DealBuddyIntake/0.1"

        def log_message(self, _format: str, *_args: Any) -> None:
            return

        def _send_bytes(
            self,
            status: int,
            body: bytes,
            content_type: str,
        ) -> None:
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()
            self.wfile.write(body)

        def _send_json(self, status: int, payload: object) -> None:
            self._send_bytes(
                status,
                _json_bytes(payload),
                "application/json; charset=utf-8",
            )

        def _read_json(self) -> dict[str, Any]:
            length = int(self.headers.get("Content-Length") or "0")
            raw = self.rfile.read(length).decode("utf-8")
            parsed = json.loads(raw or "{}")
            if not isinstance(parsed, dict):
                raise ValueError("request body must be a JSON object")
            return parsed

        def do_OPTIONS(self) -> None:
            self._send_bytes(204, b"", "text/plain; charset=utf-8")

        def do_GET(self) -> None:
            if self.path == "/health":
                self._send_json(200, {"status": "ok", "session_id": session_id})
                return
            if self.path == "/report":
                try:
                    session = store.load(session_id)
                except FileNotFoundError:
                    self._send_json(404, {"error": f"Unknown session: {session_id}"})
                    return
                report = session.report_markdown or ""
                self._send_bytes(
                    200,
                    report.encode("utf-8"),
                    "text/markdown; charset=utf-8",
                )
                return
            self._send_json(404, {"error": "not found"})

        def do_POST(self) -> None:
            if self.path != "/offers":
                self._send_json(404, {"error": "not found"})
                return
            try:
                capture = CapturePayload.model_validate(self._read_json())
                session = add_capture_to_session(store, session_id, capture)
            except (ValueError, json.JSONDecodeError, ValidationError) as exc:
                self._send_json(400, {"error": str(exc)})
                return
            except FileNotFoundError as exc:
                self._send_json(404, {"error": str(exc)})
                return
            self._send_json(
                200,
                {
                    "status": "ok",
                    "session_id": session.session_id,
                    "verified_count": len(session.verified_offers),
                    "report_available": bool(session.report_markdown),
                },
            )

    return IntakeHandler


def run_intake_server(
    session_id: str,
    port: int,
    store: SessionStore | None = None,
) -> None:
    resolved_store = store or SessionStore()
    resolved_store.load(session_id)
    server = HTTPServer(
        ("127.0.0.1", port),
        make_intake_handler(resolved_store, session_id),
    )
    try:
        server.serve_forever()
    finally:
        server.server_close()
