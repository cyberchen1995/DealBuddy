# Security Policy

## Supported Versions

Security fixes target the current `main` branch until tagged releases exist.

## Reporting A Vulnerability

Please open a private security advisory on GitHub when available. If that is not available, contact the maintainers privately before posting exploit details in public issues.

Include:

- A concise description of the issue.
- Steps to reproduce.
- Impacted files or endpoints.
- Whether credentials, cookies, API keys, local session data, or shopping account state are exposed.

## Security Boundaries

DealBuddy intentionally does not:

- Bypass CAPTCHA, login, rate limits, or anti-bot systems.
- Export or read shopping platform cookies.
- Use proxy pools, account pools, or browser fingerprint spoofing.
- Enter cart, checkout, order, or payment pages.

The Web server should bind to `127.0.0.1` by default. LLM Provider support is opt-in and must clearly disclose when captured product data may leave the local machine.

## Local Server Threat Model

The workbench is a local-only server, but the browser extension must POST captured
offers to it from shopping pages. To allow that, the CORS layer intentionally reflects
`Access-Control-Allow-Origin` (and `Access-Control-Allow-Private-Network`) for
`*.taobao.com` / `*.tmall.com` / `*.jd.com` origins. Two consequences and their
mitigations:

- **Sensitive endpoints require a local origin.** Any route that can trigger an
  outbound request or expose configuration — `POST /mcp` and
  `POST /api/settings/llm/test` — rejects requests whose `Origin` is not
  `localhost`/`127.0.0.1` (returns `403`). This prevents a script on a whitelisted
  shopping page from using the connection-test endpoint for cross-site SSRF (leaking a
  stored LLM API key via the `Authorization` header, or probing internal ports).
- **API keys never appear in responses or logs.** The LLM API key is stored only in
  `~/.dealbuddy/config.json`; API responses and the UI show a masked preview only.

Known residual: the server does not validate the `Host` header, so a DNS‑rebinding
page could reach it as a same‑origin document. Binding to `127.0.0.1` and keeping the
port non-default reduces exposure; do not expose the server on a routable interface.
