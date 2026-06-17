from __future__ import annotations

import json
from typing import Annotated
from urllib.parse import quote

import typer
from pydantic_core import to_jsonable_python

from dealbuddy.intake import run_intake_server
from dealbuddy.models import (
    ParameterCatalog,
    Platform,
    VerifiedOffer,
)
from dealbuddy.requirements import generate_clarifying_questions, initial_requirements
from dealbuddy.research import build_parameter_catalog
from dealbuddy.search import build_search_plan
from dealbuddy.session import SessionStore, ShoppingSession
from dealbuddy.web import run_web_server

app = typer.Typer(
    no_args_is_help=True,
    help="本地选品助手：用户手动浏览/采集（浏览器插件）+ 本机 intake 接收处理。",
)

SEARCH_URL_TEMPLATES = {
    Platform.TAOBAO: "https://s.taobao.com/search?q={query}",
    Platform.JD: "https://search.jd.com/Search?keyword={query}",
}


def _json_output(value: object) -> None:
    payload = to_jsonable_python(value)
    typer.echo(json.dumps(payload, ensure_ascii=False, indent=2))


def _catalog_for_session(session: ShoppingSession) -> ParameterCatalog:
    if session.parameter_catalog:
        return ParameterCatalog.model_validate(session.parameter_catalog)
    offers = [VerifiedOffer.model_validate(item) for item in session.verified_offers]
    return build_parameter_catalog(session.requirements.category, offers)


@app.command()
def start(
    category: Annotated[str, typer.Option(help="Product category")],
    request: Annotated[str, typer.Option(help="User's original request")] = "",
) -> None:
    store = SessionStore()
    session = ShoppingSession.new(initial_requirements(category, request))
    store.save(session)
    _json_output(session)


@app.command()
def show(session_id: str) -> None:
    _json_output(SessionStore().load(session_id))


@app.command()
def search(session_id: str) -> None:
    """生成各平台搜索关键词与链接，供你在浏览器手动打开并用插件采集。"""
    session = SessionStore().load(session_id)
    plan = build_search_plan(session.requirements)
    search_urls = {
        platform.value: SEARCH_URL_TEMPLATES[platform].format(query=quote(keyword))
        for platform, keyword in plan.platform_keywords.items()
        if platform in SEARCH_URL_TEMPLATES
    }
    _json_output(
        {
            "search_plan": plan,
            "search_urls": search_urls,
            "hint": (
                "先运行 `dealbuddy intake SESSION_ID` 接收；在浏览器打开上面的链接，"
                "逐个进入商品详情页用 DealBuddy 插件采集，结果会自动入库并刷新报告。"
            ),
        }
    )


@app.command()
def questions(
    session_id: str,
    limit: Annotated[int, typer.Option(min=3, max=10)] = 10,
) -> None:
    session = SessionStore().load(session_id)
    _json_output(
        generate_clarifying_questions(
            session.requirements,
            _catalog_for_session(session),
            limit=limit,
        )
    )


@app.command()
def refine(
    session_id: str,
    changes: Annotated[str, typer.Option(help="JSON object with new requirements")],
) -> None:
    parsed = json.loads(changes)
    if not isinstance(parsed, dict):
        raise typer.BadParameter("changes must be a JSON object")
    _json_output(SessionStore().refine(session_id, parsed))


@app.command()
def report(session_id: str) -> None:
    session = SessionStore().load(session_id)
    if not session.report_markdown:
        raise typer.BadParameter("Session does not have a report yet")
    typer.echo(session.report_markdown)


@app.command()
def intake(
    session_id: str,
    port: Annotated[int, typer.Option(help="Local intake HTTP port")] = 8765,
) -> None:
    typer.echo(f"DealBuddy intake listening on http://127.0.0.1:{port}")
    run_intake_server(session_id, port)


@app.command()
def web(
    port: Annotated[int, typer.Option(help="Local web server port")] = 8765,
) -> None:
    typer.echo(f"DealBuddy web listening on http://127.0.0.1:{port}")
    run_web_server(port)


if __name__ == "__main__":
    app()
