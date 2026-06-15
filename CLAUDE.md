# songscraper

Stateless, headless HTTP service that scrapes an Ultimate Guitar chord chart, creates a formatted Google Doc from a template, and returns the doc link. Runs unattended on Cloud Run, authenticates to Google with a stored refresh token, triggerable from a phone.

## Stack
Node 22 (ESM) · Puppeteer (headless Chrome) · googleapis (Drive + Docs) · Express

## Commands
```bash
npm install                       # install dependencies (Node 22)
npm test                          # run the Jest test suite (formatter regression guard)
npm run lint                      # ESLint over src/ and test/
node src/server.js                # boot the Express service locally
docker build -t songscraper .     # build the container image
npm audit                         # dependency advisory check (Node equivalent of cargo-deny)
bash .konjo/scripts/install-hooks.sh   # install Wall 1 pre-commit hook
```

## Critical Constraints
- **Crown Jewels — do not change formatter output.** `src/formatter.js` builds the Docs `batchUpdate`
  payload (two-pass bold/unbold). Its output must stay equivalent to the legacy `pageScraper.js`.
  The regression test `test/formatter.test.js` asserts payload equality against `test/formatter.fixture.json`.
  Never alter the `titles`/`chords` regexes, the `sectionTitles` array, the index math, or the
  template placeholder strings (`"Song Title - Artist Name"`, `"col2"`) without regenerating the
  fixture *and* explicit sign-off.
- **No secrets in code.** `creds.json`, `token.json`, `.env`, and refresh tokens live in env vars /
  Secret Manager only. They are git-ignored. Never write `token.json` to disk on the deployed path.
- **Headless by default; a real (headed) browser only on sanctioned paths.** When Puppeteer *launches*
  a browser it defaults to `headless: true` with the container-safe flags (`--no-sandbox
  --disable-setuid-sandbox --disable-dev-shm-usage --disable-gpu`) — no visible browser in our
  container/Cloud Run. Two sanctioned ways to use a *real (headed)* browser, both to get past UG's
  Cloudflare wall (which blocks headless Chrome from any IP):
  1. `FETCH_STRATEGY=remote` — `puppeteer.connect`s to a browser on a managed provider (Browserless /
     Browserbase); the headed window runs on their infra, never ours. (Signed off 2026-06-15.)
  2. `PUPPETEER_HEADLESS=false` — launch a headed browser on the **operator's own residential
     hardware** (e.g. a Raspberry Pi under Xvfb) where the residential IP + real fingerprint clear
     Cloudflare for free. The default stays `true`, so Cloud Run is unaffected. (Signed off 2026-06-15.
     See docs/RASPBERRY_PI.md.)
- **No timing hacks.** No `setTimeout`-based control flow. Use `await page.waitForSelector(...)` and
  awaited promises. Open and close the browser deterministically inside `scrapeSong`.
- **`/scrape` is never open.** It requires the `x-api-key` shared-secret header and a validated
  `ultimate-guitar.com` URL.
- **ESM + async/await throughout.** No callback-style Google API calls; await every promise.
- **Selectors are config, not the primary strategy.** Extraction is **heuristic-first**
  (`src/detect.js` scores candidate text blocks by chord-content fingerprint), with the CSS selector
  in `src/config.js` as a fallback. Strategy is env-switchable via `SCRAPE_STRATEGY`. Selectors are
  still worth re-pinning when convenient, but a markup change no longer breaks the scrape.

## How extraction works
`src/scraper.js` resolves the chart via `extractChordText(page)` under `SCRAPE_STRATEGY`:
- `heuristic` (default): content-based detector first; fall back to the selector if nothing clears
  `DETECT_MIN_SCORE` (resilient to UG DOM/class-name churn).
- `auto`: CSS selector first (fast, unambiguous when it works); fall back to the heuristic.
- `selector`: selector only (exact legacy behavior — the escape hatch).
Title/artist also fall back to parsing `document.title` when their selectors fail.

## Module Map
| Module | Role |
|--------|------|
| `src/server.js` | Express app, routes, API-key guard, input validation |
| `src/scraper.js` | `scrapeSong(url) -> { title, artist, rawText }` + `extractChordText` (strategy) |
| `src/detect.js` | heuristic chord-block detection: pure scoring + Puppeteer glue (primary strategy) |
| `src/formatter.js` | **Crown Jewels**: builds `batchUpdate` requests + second unbold pass (behavior-preserved) |
| `src/google/auth.js` | OAuth2 client, `/auth` + `/oauth2callback`, refresh-token load |
| `src/google/docs.js` | copy template, run `batchUpdate`, re-read doc for unbold pass |
| `src/config.js` | env-driven config: templateId, folderId, scopes, selectors, strategy, port |
| `src/constants.js` | `sectionTitles[]`, `titles` regex source, `chords` regex source |

## Quality Framework
This repo runs the **Konjo Three-Wall Quality Framework**. See `KONJO_QUALITY_FRAMEWORK.md`.
- **Wall 1** (pre-commit): `bash .konjo/scripts/install-hooks.sh` — installs `.konjo/hooks/pre-commit`
- **Wall 2** (CI): coverage, lint, dead-code, DRY, `npm audit`
- **Wall 3** (adversarial review): a distinct Claude session reviews every PR against 10 mandatory questions

## Skills
See `.claude/skills/` — auto-loaded when relevant.
Run `/konjo` to boot a full session (Brief + Discovery + Plan).
Run `/konjo-quality` for the full gate reference.
Run `/konjo-retrofit` to apply the framework to another repo.
