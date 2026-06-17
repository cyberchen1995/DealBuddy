# Contributing

Thanks for helping improve DealBuddy.

## Development Setup

```bash
uv sync
uv run pytest
node --test "tests/extension/**/*.test.cjs"
uv run ruff check .
```

## Pull Requests

- Keep changes focused on one behavior or release concern.
- Add tests for new Python APIs, Web behavior, extension contracts, or MCP tools.
- Do not add platform automation, account scraping, CAPTCHA bypass, proxy pools, cookie export, cart, checkout, order, or payment flows.
- Do not commit local DealBuddy data from `DEALBUDDY_HOME`, browser profiles, API keys, screenshots containing personal data, or shopping account information.
- Update `docs/THIRD_PARTY_ASSETS.md` when adding bundled model, wasm, JavaScript, font, icon, or image assets.

## Local Data And Privacy

DealBuddy is local-first. New features should preserve this default:

- Bind local services to `127.0.0.1` unless there is an explicit reviewed reason.
- Keep LLM usage optional and visibly disclosed.
- Avoid logging API keys, raw user credentials, cookies, or shopping account state.

## Style

- Python code uses Ruff and pytest.
- Extension code uses vanilla JavaScript and Node's built-in test runner.
- Prefer small modules with clear request/response contracts.
