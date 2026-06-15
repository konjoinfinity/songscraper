# Song Scraper 🎶🎵🎸🎹📄

## A headless service that turns an Ultimate Guitar chord chart into a formatted Google Doc.

![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
![Puppeteer](https://img.shields.io/badge/Puppeteer-40B5A4?style=for-the-badge&logo=Puppeteer&logoColor=white)
![Google Drive](https://img.shields.io/badge/Google%20Drive-4285F4?style=for-the-badge&logo=googledrive&logoColor=white)
![Google Cloud](https://img.shields.io/badge/GoogleCloud-%234285F4.svg?style=for-the-badge&logo=google-cloud&logoColor=white)

`POST /scrape { url }` → scrapes the chart with headless Chrome → copies a Google Docs template →
inserts the chart with bold section-titles/chords and unbold lyrics → returns `{ docUrl, title, artist }`.

Designed to run **unattended on Cloud Run**: headless, stateless, scales to zero, and authenticates to
Google with a stored OAuth refresh token (zero human interaction per run). Triggerable from a phone.

> This is the v2 service rewrite of the original local, GUI-only CLI tool (Replit, 2024). The
> document-formatting logic is preserved exactly — see the regression guard below.

## Architecture

```
src/
  server.js        Express app + routes + API-key guard + URL validation
  scraper.js       scrapeSong(url) -> { title, artist, rawText } + extractChordText (strategy)
  detect.js        heuristic chord-block detection (content-fingerprint scoring) — primary strategy
  formatter.js     Crown Jewels: builds the batchUpdate requests + unbold second pass
  google/
    auth.js        OAuth2 client, /auth + /oauth2callback, refresh-token load
    docs.js        copy template, batchUpdate, unbold second pass (all awaited)
  config.js        env-driven: templateId, folderId, scopes, selectors, strategy, port
  constants.js     sectionTitles[], titles regex, chords regex
test/
  detect.test.js           heuristic scoring unit tests
  scraper-strategy.test.js extractChordText strategy wiring (fake page, no browser)
  formatter.test.js        regression: refactored payload === legacy payload
  formatter.fixture.json   captured legacy batchUpdate payload (golden)
```

## How extraction works

The chord chart is located **heuristically by default** — `src/detect.js` scores candidate text
blocks by their content fingerprint (chord density, section headers, chord-alignment whitespace) and
picks the best one. This makes the scrape resilient to Ultimate Guitar's recurring DOM/class-name
changes, the failure mode that breaks selector-based scraping. The exact CSS selector
(`selectors.chordBlock` in `src/config.js`) is kept as a **fallback** (still fast and unambiguous when
it works, and worth re-pinning when convenient).

The strategy is env-switchable via `SCRAPE_STRATEGY` — the escape hatch if the heuristic ever
misbehaves in production (flip the env var, no code change):

| `SCRAPE_STRATEGY` | Behavior |
|---|---|
| `heuristic` (default) | heuristic first; fall back to the selector if nothing clears `DETECT_MIN_SCORE` |
| `auto` | selector first; fall back to the heuristic if the selector is empty |
| `selector` | selector only (exact legacy behavior) |

`DETECT_MIN_SCORE` (default `5`) is the minimum chord-chart score the heuristic must clear to be
trusted — a weak best-candidate is rejected rather than scraping the wrong element. Title/artist also
fall back to parsing `document.title` when their selectors fail.

## Endpoints

| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| `POST` | `/scrape` | `x-api-key` header | scrape a UG URL → create a formatted Google Doc |
| `GET` | `/healthz` | none | liveness probe |
| `GET` | `/auth` | none | one-time OAuth consent (bootstrap) |
| `GET` | `/oauth2callback` | none | capture the refresh token (bootstrap) |

`/scrape` accepts only well-formed `ultimate-guitar.com` URLs and requires the `x-api-key` shared
secret. It is never an open scraping endpoint.

## Local development

```bash
cp .env.example .env     # fill in OAuth client + API_KEY (see DEPLOY.md for the bootstrap)
npm install
npm test                 # formatter regression guard
npm run lint
node src/server.js       # GET http://localhost:8080/healthz -> {"status":"ok"}
```

## The Crown Jewels (do not change behavior)

The formatting logic in `src/formatter.js` is the fragile heart of the tool. It was **relocated** from
the legacy `pageScraper.js` with its output preserved exactly:
- two-pass formatting (insert + bold guesses, then re-read and unbold lyric lines),
- the template contract (`"Song Title - Artist Name"` and `"col2"` placeholders, 2-column table),
- the `titles`/`chords` regexes and `sectionTitles` array,
- the index math that builds the requests.

`npm test` asserts the refactored formatter produces a payload **identical** to the captured legacy
payload (`test/formatter.fixture.json`, 87 requests for the sample chart). Regenerate the fixture only
with `npm run fixture` and explicit sign-off.

## Deployment

See **[DEPLOY.md](./DEPLOY.md)** for the full `gcloud run deploy` flow (image build, Secret Manager
wiring, and the one-time `/auth` bootstrap).

Two **human action items** that cannot be automated:
1. Set the OAuth consent screen to **Production** (in Testing status, Google expires refresh tokens
   after 7 days).
2. Add the deployed `/oauth2callback` URL to the OAuth client's Authorized redirect URIs.
3. (Maintenance) Re-pin the UG selectors in `src/config.js` if a scrape returns empty fields.

## Out of scope (deferred)

PDF auto-export, repeating-chord-pattern dedup, and the mobile trigger surface (PWA / Telegram bot /
iOS Shortcut). Clean extension points are left in place.

## Conventions

This repo follows the **Konjo Quality Framework** (`CLAUDE.md`, `KONJO_QUALITY_FRAMEWORK.md`,
`.claude/`, `.konjo/`). Run `/konjo` to boot a session.

## License

MIT © [Konjo Tech - Wesley Scholl](https://github.com/konjoinfinity)
