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
- **Crown Jewels — change formatter/layout behavior only deliberately.** `src/formatter.js` +
  `src/layout.js` build the Docs `batchUpdate` payload in two passes: pass 1 = three `replaceAllText`
  requests (title + `col1` + `col2` placeholders); pass 2 = `updateTextStyle` per paragraph, **bold by
  rendered kind** (chord/section bold, lyric not), aligned by content position with indices from a
  re-read of the doc. The regression test `test/formatter.test.js` asserts the pass-1 payload against
  `test/formatter.fixture.json`; `test/layout.test.js` + `test/charts.test.js` guard layout behavior.
  Don't alter the template placeholder strings (`"Song Title - Artist Name"`, `"col1"`, `"col2"`), the
  wrap-aware budget semantics, or the bold-by-kind contract without regenerating the fixture (`npm run
  fixture`) *and* explicit sign-off. (Line classification lives in `src/detect.js`; there are no
  chord/section regexes in the formatter anymore.)
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
| `src/scraper.js` | `scrapeSong(url) -> { title, artist, rawText }` (1 retry) + `extractChordText` (strategy) |
| `src/fetcher.js` | page acquisition: warm shared browser + per-scrape context (`openChart`), fetch strategies |
| `src/detect.js` | heuristic chord-block detection + `classifyLine` (pure scoring + Puppeteer glue) |
| `src/layout.js` | **Crown Jewels**: pure section-aware layout — parse, compact, dedupe, wrap-aware 2-col pack |
| `src/formatter.js` | **Crown Jewels**: `replaceAllText` requests (pass 1) + bold-by-kind style pass (pass 2) |
| `src/google/auth.js` | OAuth2 client (memoized), `/auth` + `/oauth2callback`, refresh-token load |
| `src/google/docs.js` | copy template, replace placeholders, re-read doc for the style pass (timed out) |
| `src/config.js` | env-driven config: templateId, folderId, scopes, selectors, strategy, port, budgets, timeouts |
| `src/constants.js` | template placeholder strings (`col1`, `col2`, title) |

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
