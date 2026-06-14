---
paths:
  - "**/*.js"
  - "**/*.mjs"
  - "**/*.cjs"
---
# Node Conventions

- **ESM throughout** — `import`/`export`, `"type": "module"` in package.json. No `require()` in `src/`.
- **async/await, not callbacks** — never use the callback form of googleapis (`drive.files.copy(opts, cb)`);
  always `await` the promise form. No `.then()` chains where `await` reads cleaner.
- **No silent failures** — never swallow an error. Catch, log with context (`console.error`/logger),
  and rethrow or return a typed error. A fallback that hides a real failure is a bug.
- **No `setTimeout`-based control flow** — wait on real conditions (`await page.waitForSelector(...)`),
  not arbitrary delays.
- **No secrets in code** — credentials, tokens, and API keys come from `process.env` only. Never
  hardcode IDs that should be configurable; put them in `src/config.js`.
- **Validate at the boundary** — every external input (HTTP body, query, scraped DOM) is validated
  before use. Reject malformed URLs; never scrape arbitrary hosts.
- **Deterministic resource lifecycle** — open and close the Puppeteer browser within the call that
  owns it; use `try/finally` so the browser always closes, even on error.
- **Lint clean** — `npm run lint` must pass before committing. `npm audit` reports zero high/critical
  advisories (the Node equivalent of `cargo deny`).
- **Small modules** — file ≤ 500 lines (target 300); function body ≤ 50 lines (target 30). Split before
  hitting the limit.
