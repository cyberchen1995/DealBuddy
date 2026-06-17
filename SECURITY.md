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
