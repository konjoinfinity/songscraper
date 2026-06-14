---
paths:
  - "**/server*"
  - "**/auth*"
  - "**/google/**"
  - "**/scraper*"
---
# Security Rules

- Validate all inputs at the API boundary: `/scrape` accepts only a well-formed `ultimate-guitar.com`
  URL — reject any other host, scheme, or malformed input.
- `/scrape` is never open: require the `x-api-key` shared-secret header, compared to the `API_KEY` env
  var using a constant-time comparison. Reject if missing or wrong.
- Never store API keys, OAuth client secrets, or refresh tokens in the codebase — use environment
  variables / Secret Manager. Never write `token.json` to disk on the deployed path.
- Never log secrets — do not log the refresh token, access token, client secret, or `API_KEY`.
- The deployed service is private or behind the API key — never expose an open scraping endpoint.
- OAuth refresh tokens are long-lived credentials: treat them as P0 secrets. Rotate if leaked.
- Set per-request timeouts on the scrape path so a hung page cannot pin a container indefinitely.
- Do not leak internal paths or stack traces in HTTP error responses.
