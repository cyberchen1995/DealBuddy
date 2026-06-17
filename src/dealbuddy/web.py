from __future__ import annotations

import json
from collections.abc import Iterator
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Literal
from urllib import request as urlrequest
from urllib.parse import urlparse

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import (
    FileResponse,
    HTMLResponse,
    JSONResponse,
    Response,
    StreamingResponse,
)
from pydantic import BaseModel, Field
from pydantic_core import to_jsonable_python

from dealbuddy.config import ConfigStore, LLMSettings
from dealbuddy.intake import (
    CapturePayload,
    add_capture_to_session,
    rebuild_session_report,
)
from dealbuddy.models import VerifiedOffer
from dealbuddy.ranking import rank_offers
from dealbuddy.reporting import build_markdown_report
from dealbuddy.requirements import initial_requirements
from dealbuddy.session import SessionStore, ShoppingSession

STATIC_DIR = Path(__file__).with_name("static")
LOCALHOST_HOSTS = {"127.0.0.1", "localhost"}
PRICE_DISCLAIMER = (
    "> 价格来自页面可见信息。估算应付只计算页面明确展示且可直接解析的"
    "优惠，不代表结算价格。"
)
ALLOWED_ECOMMERCE_DOMAINS = ("taobao.com", "tmall.com", "jd.com")


class CreateSessionRequest(BaseModel):
    category: str
    request: str = ""


class RefineRequest(BaseModel):
    changes: dict[str, Any]


class ChatRequest(BaseModel):
    content: str = Field(min_length=1)


class LLMSettingsRequest(BaseModel):
    enabled: bool = False
    provider_name: str = "openai-compatible"
    base_url: str = ""
    model: str = ""
    api_key: str = ""


def _jsonable(value: object) -> object:
    return to_jsonable_python(value)


def _now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _session_payload(session: ShoppingSession) -> dict[str, Any]:
    return dict(_jsonable(session))


def _save_current_session(config_store: ConfigStore, session_id: str) -> None:
    config = config_store.load()
    config.current_session_id = session_id
    config_store.save(config)


def _current_session_id(config_store: ConfigStore) -> str:
    session_id = config_store.load().current_session_id
    if not session_id:
        raise HTTPException(404, "No current DealBuddy session")
    return session_id


def _append_message(
    store: SessionStore,
    session_id: str,
    *,
    role: Literal["user", "assistant"],
    content: str,
    source: Literal["local", "llm"] | None = None,
) -> ShoppingSession:
    session = store.load(session_id)
    message: dict[str, Any] = {
        "role": role,
        "content": content,
        "created_at": _now_iso(),
    }
    if source:
        message["source"] = source
    session.messages.append(message)
    store.save(session)
    return session


def _conversation_context(session: ShoppingSession) -> list[dict[str, str]]:
    context = []
    for message in session.messages[-12:]:
        content = str(message.get("content") or "").strip()
        role = str(message.get("role") or "").strip()
        if content and role:
            context.append(
                {
                    "role": role,
                    "content": content,
                    "source": str(message.get("source") or ""),
                }
            )
    return context


def _append_conversation_to_report(
    report: str,
    conversation: list[dict[str, str]],
) -> str:
    if not conversation:
        return report
    lines = [report.rstrip(), "", "## 追问记录"]
    role_names = {"user": "用户", "assistant": "助手"}
    for message in conversation:
        role = role_names.get(message["role"], message["role"])
        source = f" / {message['source']}" if message["source"] else ""
        content = message["content"].replace("\n", " ")
        lines.append(f"- {role}{source}：{content}")
    return "\n".join(lines).rstrip() + "\n"


def _ensure_report_metadata(session: ShoppingSession, report: str) -> str:
    lines = report.strip().splitlines()
    if not lines:
        lines = [f"# DealBuddy 选品报告：{session.requirements.category}"]
    version_line = f"需求版本：v{session.requirements.version}"
    version_index = next(
        (
            index
            for index, line in enumerate(lines)
            if line.strip().startswith("需求版本：")
        ),
        None,
    )
    if version_index is None:
        insert_at = 1 if lines[0].startswith("#") else 0
        lines[insert_at:insert_at] = ["", version_line]
    else:
        lines[version_index] = version_line
    if "不代表结算价格" not in "\n".join(lines):
        insert_at = 1
        for index, line in enumerate(lines):
            if line.strip().startswith("需求版本："):
                insert_at = index + 1
                break
        lines[insert_at:insert_at] = ["", PRICE_DISCLAIMER]
    return "\n".join(lines).rstrip() + "\n"


def build_session_report_with_context(session: ShoppingSession) -> str:
    verified = [VerifiedOffer.model_validate(item) for item in session.verified_offers]
    report = build_markdown_report(
        session.requirements,
        rank_offers(verified, session.requirements),
    )
    return _append_conversation_to_report(report, _conversation_context(session))


def build_local_answer(session: ShoppingSession, content: str) -> str:
    offer_count = len(session.verified_offers)
    if offer_count == 0:
        return (
            "本地规则分析：当前会话还没有采集商品。先用浏览器扩展采集 2-4 个候选后，"
            "我可以基于页面价格、SKU、规格和报告帮你比较。"
        )
    report_hint = "报告已生成" if session.report_markdown else "报告尚未生成"
    top_titles = [
        VerifiedOffer.model_validate(item).title for item in session.verified_offers[:3]
    ]
    return (
        f"本地规则分析：当前已采集 {offer_count} 个商品，{report_hint}。"
        f"这轮问题是“{content}”。建议先看报告里的“最符合需求”和“综合性价比”，"
        f"再重点核对这些候选：{'；'.join(top_titles)}。"
        "如已开启 LLM Provider，对话区会明确提示并使用外部模型做更自然的追问分析。"
    )


def _llm_chat_payload(
    settings: LLMSettings,
    session: ShoppingSession,
    content: str,
    *,
    stream: bool = False,
) -> dict[str, object]:
    offers = [
        VerifiedOffer.model_validate(item).model_dump(mode="json")
        for item in session.verified_offers
    ]
    payload: dict[str, object] = {
        "model": settings.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 DealBuddy 的本地购物研究助手。"
                    "基于用户手动采集的商品事实回答，"
                    "不要声称估算应付就是结算价。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "requirements": session.requirements.model_dump(mode="json"),
                        "offers": offers,
                        "report": session.report_markdown,
                        "question": content,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    if stream:
        payload["stream"] = True
    return payload


def _llm_request(
    settings: LLMSettings,
    payload: dict[str, object],
) -> urlrequest.Request:
    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    return urlrequest.Request(
        settings.base_url,
        data=data,
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )


def call_llm_provider(
    settings: LLMSettings,
    session: ShoppingSession,
    content: str,
) -> str:
    http_request = _llm_request(
        settings,
        _llm_chat_payload(settings, session, content),
    )
    with urlrequest.urlopen(http_request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    try:
        return str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("LLM provider returned an unsupported response") from exc


def call_llm_report_provider(
    settings: LLMSettings,
    session: ShoppingSession,
    report_markdown: str,
) -> str:
    offers = [
        VerifiedOffer.model_validate(item).model_dump(mode="json")
        for item in session.verified_offers
    ]
    payload = {
        "model": settings.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 DealBuddy 的选品报告助手。"
                    "基于商品事实、当前报告草稿和追问记录重新生成 Markdown 报告。"
                    "必须保留价格边界说明，不要声称估算应付就是结算价。"
                    "报告要体现追问记录里的新增偏好。"
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "requirements": session.requirements.model_dump(mode="json"),
                        "offers": offers,
                        "messages": _conversation_context(session),
                        "report_markdown": report_markdown,
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    with urlrequest.urlopen(_llm_request(settings, payload), timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    try:
        report = str(payload["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as exc:
        raise RuntimeError("LLM provider returned an unsupported response") from exc
    return report or report_markdown


def call_llm_provider_stream(
    settings: LLMSettings,
    session: ShoppingSession,
    content: str,
) -> Iterator[str]:
    http_request = _llm_request(
        settings,
        _llm_chat_payload(settings, session, content, stream=True),
    )
    with urlrequest.urlopen(http_request, timeout=30) as response:
        while True:
            raw_line = response.readline()
            if not raw_line:
                break
            line = raw_line.decode("utf-8").strip()
            if not line or line.startswith(":"):
                continue
            if not line.startswith("data:"):
                continue
            data = line.removeprefix("data:").strip()
            if data == "[DONE]":
                break
            try:
                payload = json.loads(data)
                choice = payload["choices"][0]
            except (json.JSONDecodeError, KeyError, IndexError, TypeError) as exc:
                raise RuntimeError(
                    "LLM provider returned an unsupported stream"
                ) from exc
            delta = choice.get("delta") or {}
            content_delta = delta.get("content")
            if content_delta:
                yield str(content_delta)


def _typewriter_chunks(content: str, size: int = 8) -> Iterator[str]:
    for index in range(0, len(content), size):
        yield content[index : index + size]


def _sse(event: str, payload: object) -> str:
    data = json.dumps(_jsonable(payload), ensure_ascii=False)
    return f"event: {event}\ndata: {data}\n\n"


def stream_session_answer_events(
    store: SessionStore,
    config_store: ConfigStore,
    session_id: str,
    content: str,
) -> Iterator[str]:
    _append_message(store, session_id, role="user", content=content)
    yield _sse("user", {"role": "user", "content": content})
    session = store.load(session_id)
    llm = config_store.load().llm
    source: Literal["local", "llm"] = "local"
    answer = ""
    if llm.configured:
        source = "llm"
        try:
            for chunk in call_llm_provider_stream(llm, session, content):
                answer += chunk
                yield _sse("delta", {"content": chunk, "source": source})
        except Exception as exc:  # noqa: BLE001
            source = "local"
            answer = (
                f"{build_local_answer(session, content)}\n\n"
                f"LLM Provider 调用失败：{exc}"
            )
            for chunk in _typewriter_chunks(answer):
                yield _sse("delta", {"content": chunk, "source": source})
    else:
        answer = build_local_answer(session, content)
        for chunk in _typewriter_chunks(answer):
            yield _sse("delta", {"content": chunk, "source": source})
    session = _append_message(
        store,
        session_id,
        role="assistant",
        content=answer,
        source=source,
    )
    yield _sse("done", {"source": source, "messages": session.messages})


def _short_offer_summary(value: object) -> str | None:
    summary = " ".join(str(value or "").split())
    if not summary:
        return None
    return summary[:30]


def _parse_llm_json_content(content: str) -> object:
    stripped = content.strip()
    if stripped.startswith("```"):
        lines = stripped.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        stripped = "\n".join(lines).strip()
    return json.loads(stripped)


def call_llm_offer_summaries(
    settings: LLMSettings,
    session: ShoppingSession,
    offers: list[VerifiedOffer],
) -> dict[str, str]:
    prompt = {
        "model": settings.model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "你是 DealBuddy 的选品分析助手。"
                    "为每个商品写一句中文优劣短评，30字以内，"
                    "同时点出一个优势和一个短板。"
                    "只能基于输入事实，不要编造参数。"
                    "只返回 JSON："
                    '{"summaries":[{"url":"商品链接","summary":"短评"}]}'
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "requirements": session.requirements.model_dump(mode="json"),
                        "offers": [
                            offer.model_dump(mode="json") for offer in offers
                        ],
                    },
                    ensure_ascii=False,
                ),
            },
        ],
    }
    data = json.dumps(prompt, ensure_ascii=False).encode("utf-8")
    http_request = urlrequest.Request(
        settings.base_url,
        data=data,
        headers={
            "Authorization": f"Bearer {settings.api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urlrequest.urlopen(http_request, timeout=30) as response:
        payload = json.loads(response.read().decode("utf-8"))
    try:
        content = str(payload["choices"][0]["message"]["content"])
        parsed = _parse_llm_json_content(content)
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise RuntimeError("LLM provider returned an unsupported response") from exc
    entries = (
        parsed.get("summaries")
        if isinstance(parsed, dict)
        else parsed
        if isinstance(parsed, list)
        else []
    )
    summaries: dict[str, str] = {}
    if not isinstance(entries, list):
        return summaries
    for entry in entries:
        if not isinstance(entry, dict):
            continue
        summary = _short_offer_summary(entry.get("summary"))
        url = str(entry.get("url") or "")
        if summary and url:
            summaries[url] = summary
    return summaries


def maybe_add_llm_offer_summaries(
    store: SessionStore,
    config_store: ConfigStore,
    session: ShoppingSession,
) -> ShoppingSession:
    llm = config_store.load().llm
    if not llm.configured:
        return session
    missing = [
        VerifiedOffer.model_validate(item)
        for item in session.verified_offers
        if not item.get("llm_summary")
    ]
    if not missing:
        return session
    try:
        summaries = call_llm_offer_summaries(llm, session, missing)
    except Exception:  # noqa: BLE001
        return session
    changed = False
    for item in session.verified_offers:
        if item.get("llm_summary"):
            continue
        summary = summaries.get(str(item.get("url") or ""))
        if summary:
            item["llm_summary"] = summary
            changed = True
    if changed:
        rebuild_session_report(session)
        store.save(session)
    return session


def add_offer_to_session(
    store: SessionStore,
    config_store: ConfigStore,
    session_id: str,
    payload: CapturePayload,
) -> ShoppingSession:
    session = add_capture_to_session(store, session_id, payload)
    return maybe_add_llm_offer_summaries(store, config_store, session)


def regenerate_session_report(
    store: SessionStore,
    config_store: ConfigStore,
    session_id: str,
) -> ShoppingSession:
    session = store.load(session_id)
    session.requirements.version += 1
    report = build_session_report_with_context(session)
    llm = config_store.load().llm
    if llm.configured:
        try:
            report = call_llm_report_provider(llm, session, report)
        except Exception as exc:  # noqa: BLE001
            report = (
                f"{report.rstrip()}\n\n"
                f"> LLM 报告重生成失败，已保留本地报告：{exc}\n"
            )
    session.report_markdown = _ensure_report_metadata(session, report)
    store.save(session)
    return session


def answer_session(
    store: SessionStore,
    config_store: ConfigStore,
    session_id: str,
    content: str,
) -> ShoppingSession:
    _append_message(store, session_id, role="user", content=content)
    session = store.load(session_id)
    llm = config_store.load().llm
    source: Literal["local", "llm"] = "local"
    if llm.configured:
        try:
            answer = call_llm_provider(llm, session, content)
            source = "llm"
        except Exception as exc:  # noqa: BLE001
            answer = (
                f"{build_local_answer(session, content)}\n\n"
                f"LLM Provider 调用失败：{exc}"
            )
    else:
        answer = build_local_answer(session, content)
    return _append_message(
        store,
        session_id,
        role="assistant",
        content=answer,
        source=source,
    )


def _mcp_tool_schemas() -> list[dict[str, Any]]:
    return [
        {
            "name": "create_session",
            "description": (
                "Create a DealBuddy shopping research session and make it current."
            ),
            "inputSchema": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "request": {"type": "string"},
                },
                "required": ["category"],
            },
        },
        {
            "name": "list_sessions",
            "description": "List local DealBuddy sessions.",
            "inputSchema": {"type": "object", "properties": {}},
        },
        {
            "name": "show_session",
            "description": "Show one local DealBuddy session.",
            "inputSchema": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
        {
            "name": "set_current_session",
            "description": "Set the current session used by browser-extension intake.",
            "inputSchema": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
        {
            "name": "add_offer",
            "description": "Add or update a captured offer in a session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "offer": {"type": "object"},
                },
                "required": ["session_id", "offer"],
            },
        },
        {
            "name": "refine_requirements",
            "description": "Merge structured requirement changes into a session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "changes": {"type": "object"},
                },
                "required": ["session_id", "changes"],
            },
        },
        {
            "name": "get_report",
            "description": "Read the Markdown report for a session.",
            "inputSchema": {
                "type": "object",
                "properties": {"session_id": {"type": "string"}},
                "required": ["session_id"],
            },
        },
        {
            "name": "ask_session",
            "description": "Ask a question about a DealBuddy session.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "session_id": {"type": "string"},
                    "content": {"type": "string"},
                },
                "required": ["session_id", "content"],
            },
        },
    ]


def _mcp_result(value: object) -> dict[str, object]:
    payload = _jsonable(value)
    return {
        "content": [
            {
                "type": "text",
                "text": json.dumps(payload, ensure_ascii=False, indent=2),
            }
        ],
        "structuredContent": payload,
    }


def _mcp_error(message_id: object, code: int, message: str) -> dict[str, object]:
    return {
        "jsonrpc": "2.0",
        "id": message_id,
        "error": {"code": code, "message": message},
    }


def _call_mcp_tool(
    name: str,
    arguments: dict[str, Any],
    store: SessionStore,
    config_store: ConfigStore,
) -> object:
    if name == "create_session":
        session = ShoppingSession.new(
            initial_requirements(
                str(arguments["category"]),
                str(arguments.get("request") or ""),
            )
        )
        store.save(session)
        _save_current_session(config_store, session.session_id)
        return {"session": session, "current_session_id": session.session_id}
    if name == "list_sessions":
        return {
            "current_session_id": config_store.load().current_session_id,
            "sessions": store.list_sessions(),
        }
    if name == "show_session":
        return {"session": store.load(str(arguments["session_id"]))}
    if name == "set_current_session":
        session_id = str(arguments["session_id"])
        store.load(session_id)
        _save_current_session(config_store, session_id)
        return {"current_session_id": session_id}
    if name == "add_offer":
        session = add_offer_to_session(
            store,
            config_store,
            str(arguments["session_id"]),
            CapturePayload.model_validate(arguments["offer"]),
        )
        return {
            "session_id": session.session_id,
            "verified_count": len(session.verified_offers),
            "report_available": bool(session.report_markdown),
        }
    if name == "refine_requirements":
        return {
            "session": store.refine(
                str(arguments["session_id"]),
                arguments["changes"],
            )
        }
    if name == "get_report":
        session = store.load(str(arguments["session_id"]))
        return {
            "session_id": session.session_id,
            "report": session.report_markdown or "",
        }
    if name == "ask_session":
        session = answer_session(
            store,
            config_store,
            str(arguments["session_id"]),
            str(arguments["content"]),
        )
        return {"session_id": session.session_id, "messages": session.messages}
    raise KeyError(f"Unknown MCP tool: {name}")


def _origin_hostname(origin: str) -> str:
    return (urlparse(origin).hostname or "").lower()


def _host_matches_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith(f".{domain}")


def _is_trusted_mcp_origin(origin: str | None) -> bool:
    if origin is None:
        return True
    return _origin_hostname(origin) in LOCALHOST_HOSTS


def _allowed_cors_origin(origin: str | None) -> str | None:
    if not origin:
        return None
    parsed = urlparse(origin)
    if parsed.scheme == "chrome-extension":
        return origin
    if parsed.scheme in {"http", "https"}:
        host = (parsed.hostname or "").lower()
        if host in LOCALHOST_HOSTS:
            return origin
        if any(
            _host_matches_domain(host, domain)
            for domain in ALLOWED_ECOMMERCE_DOMAINS
        ):
            return origin
    return None


def _add_cors_headers(response: Response, origin: str | None) -> Response:
    allowed_origin = _allowed_cors_origin(origin)
    if allowed_origin:
        response.headers["Access-Control-Allow-Origin"] = allowed_origin
        response.headers["Vary"] = "Origin"
        response.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "Content-Type"
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response


def create_app(
    *,
    store: SessionStore | None = None,
    config_store: ConfigStore | None = None,
) -> FastAPI:
    resolved_store = store or SessionStore()
    resolved_config_store = config_store or ConfigStore()
    app = FastAPI(title="DealBuddy", version="0.1.0")

    @app.middleware("http")
    async def cors_for_extension_intake(
        request: Request,
        call_next: Any,
    ) -> Response:
        origin = request.headers.get("origin")
        if request.method == "OPTIONS":
            return _add_cors_headers(Response(status_code=204), origin)
        response = await call_next(request)
        return _add_cors_headers(response, origin)

    @app.get("/", response_class=HTMLResponse)
    def index() -> FileResponse:
        return FileResponse(STATIC_DIR / "index.html")

    @app.get("/api/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.get("/api/sessions")
    def list_sessions() -> dict[str, object]:
        return {
            "current_session_id": resolved_config_store.load().current_session_id,
            "sessions": resolved_store.list_sessions(),
        }

    @app.post("/api/sessions")
    def create_session(payload: CreateSessionRequest) -> dict[str, object]:
        session = ShoppingSession.new(
            initial_requirements(payload.category, payload.request)
        )
        resolved_store.save(session)
        _save_current_session(resolved_config_store, session.session_id)
        return {"session": session, "current_session_id": session.session_id}

    @app.get("/api/sessions/{session_id}")
    def show_session(session_id: str) -> dict[str, object]:
        try:
            return {"session": resolved_store.load(session_id)}
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc

    @app.post("/api/sessions/{session_id}/current")
    def set_current_session(session_id: str) -> dict[str, str]:
        try:
            resolved_store.load(session_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        _save_current_session(resolved_config_store, session_id)
        return {"current_session_id": session_id}

    @app.post("/api/current/offers")
    def add_current_offer(payload: CapturePayload) -> dict[str, object]:
        session = add_offer_to_session(
            resolved_store,
            resolved_config_store,
            _current_session_id(resolved_config_store),
            payload,
        )
        return {
            "status": "ok",
            "session_id": session.session_id,
            "verified_count": len(session.verified_offers),
            "report_available": bool(session.report_markdown),
        }

    @app.post("/offers")
    def add_legacy_current_offer(payload: CapturePayload) -> dict[str, object]:
        return add_current_offer(payload)

    @app.post("/api/sessions/{session_id}/offers")
    def add_session_offer(
        session_id: str,
        payload: CapturePayload,
    ) -> dict[str, object]:
        session = add_offer_to_session(
            resolved_store,
            resolved_config_store,
            session_id,
            payload,
        )
        return {
            "status": "ok",
            "session_id": session.session_id,
            "verified_count": len(session.verified_offers),
            "report_available": bool(session.report_markdown),
        }

    @app.delete("/api/sessions/{session_id}/offers/{offer_index}")
    def delete_session_offer(session_id: str, offer_index: int) -> dict[str, object]:
        try:
            session = resolved_store.load(session_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        if offer_index < 0 or offer_index >= len(session.verified_offers):
            raise HTTPException(404, f"Unknown offer index: {offer_index}")
        removed_offer = session.verified_offers.pop(offer_index)
        rebuild_session_report(session)
        resolved_store.save(session)
        return {
            "status": "ok",
            "session_id": session.session_id,
            "verified_count": len(session.verified_offers),
            "report_available": bool(session.report_markdown),
            "removed_offer": removed_offer,
            "session": session,
        }

    @app.post("/api/sessions/{session_id}/refine")
    def refine_session(session_id: str, payload: RefineRequest) -> dict[str, object]:
        return {"session": resolved_store.refine(session_id, payload.changes)}

    @app.get("/api/sessions/{session_id}/report")
    def get_report(session_id: str) -> dict[str, str]:
        session = resolved_store.load(session_id)
        return {"session_id": session_id, "report": session.report_markdown or ""}

    @app.post("/api/sessions/{session_id}/report/regenerate")
    def regenerate_report(session_id: str) -> dict[str, object]:
        try:
            session = regenerate_session_report(
                resolved_store,
                resolved_config_store,
                session_id,
            )
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        return {"session": session}

    @app.post("/api/sessions/{session_id}/messages")
    def post_message(session_id: str, payload: ChatRequest) -> dict[str, object]:
        try:
            session = answer_session(
                resolved_store,
                resolved_config_store,
                session_id,
                payload.content.strip(),
            )
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        return {"session_id": session.session_id, "messages": session.messages}

    @app.post("/api/sessions/{session_id}/messages/stream")
    def post_message_stream(
        session_id: str,
        payload: ChatRequest,
    ) -> StreamingResponse:
        content = payload.content.strip()
        try:
            resolved_store.load(session_id)
        except FileNotFoundError as exc:
            raise HTTPException(404, str(exc)) from exc
        return StreamingResponse(
            stream_session_answer_events(
                resolved_store,
                resolved_config_store,
                session_id,
                content,
            ),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache"},
        )

    @app.get("/api/settings/llm")
    def get_llm_settings() -> dict[str, object]:
        return resolved_config_store.public_llm_status()

    @app.post("/api/settings/llm")
    def save_llm_settings(payload: LLMSettingsRequest) -> dict[str, object]:
        config = resolved_config_store.load()
        config.llm = LLMSettings(
            enabled=payload.enabled,
            provider_name=payload.provider_name.strip() or "openai-compatible",
            base_url=payload.base_url.strip(),
            model=payload.model.strip(),
            api_key=payload.api_key.strip() or config.llm.api_key,
        )
        resolved_config_store.save(config)
        if config.llm.configured and config.current_session_id:
            try:
                session = resolved_store.load(config.current_session_id)
            except FileNotFoundError:
                pass
            else:
                maybe_add_llm_offer_summaries(
                    resolved_store,
                    resolved_config_store,
                    session,
                )
        return resolved_config_store.public_llm_status()

    @app.post("/mcp")
    async def mcp_endpoint(request: Request) -> JSONResponse:
        if not _is_trusted_mcp_origin(request.headers.get("origin")):
            raise HTTPException(403, "Untrusted Origin")
        message = await request.json()
        message_id = message.get("id")
        method = message.get("method")
        params = message.get("params") or {}
        try:
            if method == "initialize":
                result: object = {
                    "protocolVersion": "2025-06-18",
                    "capabilities": {"tools": {}},
                    "serverInfo": {"name": "dealbuddy", "version": "0.1.0"},
                }
            elif method == "tools/list":
                result = {"tools": _mcp_tool_schemas()}
            elif method == "tools/call":
                result = _mcp_result(
                    _call_mcp_tool(
                        str(params["name"]),
                        dict(params.get("arguments") or {}),
                        resolved_store,
                        resolved_config_store,
                    )
                )
            else:
                return JSONResponse(_mcp_error(message_id, -32601, "Method not found"))
        except (KeyError, ValueError, FileNotFoundError) as exc:
            return JSONResponse(_mcp_error(message_id, -32602, str(exc)))
        return JSONResponse({"jsonrpc": "2.0", "id": message_id, "result": result})

    return app


def run_web_server(port: int) -> None:
    import uvicorn

    uvicorn.run(create_app(), host="127.0.0.1", port=port)
