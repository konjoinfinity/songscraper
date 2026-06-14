---
name: songscraper-context
description: Full songscraper project context — architecture, the Crown Jewels formatter contract, standing rules for agents, and deployment shape. Auto-load when working on scraping, formatting, Google auth, or Cloud Run deployment.
user-invocable: false
---
# songscraper — Full Project Context

## What It Is
A stateless, headless HTTP service. `POST /scrape { url }` → scrapes an Ultimate Guitar chord chart
with headless Puppeteer → copies a Google Docs template → runs Docs `batchUpdate` to insert the chart
with bold section-titles/chords and unbold lyrics → returns `{ docUrl, title, artist }`. Runs on Cloud
Run, scales to zero, authenticates with a stored OAuth refresh token (zero human interaction per run).

## Architecture
| Module | Role |
|--------|------|
| `src/server.js` | Express app, routes (`POST /scrape`, `GET /healthz`, `GET /auth`, `GET /oauth2callback`), API-key guard, URL validation |
| `src/scraper.js` | `scrapeSong(url) -> { title, artist, rawText }` — headless Puppeteer, deterministic browser lifecycle |
| `src/formatter.js` | **Crown Jewels** — builds the `batchUpdate` requests + the post-insert unbold pass |
| `src/google/auth.js` | OAuth2 client, `/auth` + `/oauth2callback`, refresh-token load (env/Secret Manager) |
| `src/google/docs.js` | copy template, run `batchUpdate`, re-read doc for the unbold second pass |
| `src/config.js` | env-driven: templateId, folderId, scopes, selectors, port |
| `src/constants.js` | `sectionTitles[]`, `titles` regex source, `chords` regex source |

## The Crown Jewels Contract (do not break)
- **Two-pass formatting:** (1) insert column-1 text at computed indices with bold/unbold guesses,
  then (2) re-read the doc's table cell and unbold lyric lines.
- **Template contract:** the template is a 2-column table. Column 1 is filled by inserted text at
  indices; column 2 by `replaceAllText` on the literal `"col2"`; the title by `replaceAllText` on
  `"Song Title - Artist Name"`. These placeholder strings are exact — never change them.
- **Regexes / `sectionTitles`:** centralized in `src/constants.js`; patterns must not change. Note the
  `titles` and `chords` regexes are `/g` and their `.test()` calls are intentionally stateful within a
  single `buildBatchRequests` invocation — preserve the call sequence.
- **Index math:** `newFirstIndex`, `indexToSplit`, and the `indexCount` accumulation that builds the
  `requests`/`filteredRequests` arrays must produce the same payload as the legacy `pageScraper.js`.
- **Regression guard:** `test/formatter.test.js` vs `test/formatter.fixture.json`. If it fails after a
  change, the change broke behavior. Fix the code, not the fixture.

## Standing Rules for Agents
- Headless only; container-safe Puppeteer flags; no `setTimeout` control flow.
- No secrets in the tree; refresh token from env/Secret Manager; never write `token.json` on deploy.
- `/scrape` behind the `x-api-key` header + UG URL validation.
- `npm run lint` + `npm test` green before commit.

## Human Action Items (cannot be automated here)
1. Set the OAuth consent screen to **Production** (Testing status expires refresh tokens after 7 days).
2. Add the deployed `/oauth2callback` URL to the authorized redirect URIs in Google Cloud console.
3. Re-verify UG selectors against a live page — they rot whenever UG ships markup changes.

## Out of Scope (deferred)
PDF auto-export, repeating-chord-pattern dedup, and the mobile trigger surface (PWA / Telegram / iOS
Shortcut). Leave clean extension points; keep the migration focused on the headless, unattended service.
