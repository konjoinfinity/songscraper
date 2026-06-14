---
name: konjo-quality
description: Konjo Code Quality Framework — gate definitions, thresholds, tools, and enforcement points for songscraper. Auto-load when writing tests, reviewing code quality, refactoring, or when quality gate failures are mentioned. Applies the Three-Wall framework to prevent AI slop.
user-invocable: true
---

# Konjo Quality Framework — Agent Reference (songscraper)

## Why This Exists

AI-assisted code produces **1.7× more logical and correctness bugs** than traditional development
(CodeRabbit 2026). AI agents change tests so broken code passes instead of fixing the code. AI
self-review is architecturally circular — it checks code against itself, not against intent. This
framework provides external ground truth via three independent walls that cannot be reasoned past.

The Konjo Critic (Wall 3) runs in a **separate Claude session** with a different capability profile, to
reduce correlated failures.

---

## The Three Walls

| Wall | When | What | Blocks |
|------|------|------|--------|
| **Wall 1** | Pre-commit hook | Lint, format, DRY (staged), TODO scan, secret scan, file-size | The commit |
| **Wall 2** | CI / GitHub Actions | Coverage, lint, dead code, DRY, `npm audit`, docs | The merge |
| **Wall 3** | CI (PRs only) | Claude adversarial review against 10 mandatory questions | The merge |

---

## Hard Quality Thresholds

| Metric | Hard Block | Target | Tool (Node) |
|--------|-----------|--------|-------------|
| Line coverage | ≥ 80% | ≥ 95% | jest --coverage / c8 |
| Lint violations | 0 | 0 | eslint |
| Format violations | 0 | 0 | prettier --check |
| Dead code | 0 | 0 | eslint (no-unused-vars) / knip |
| Cyclomatic complexity per function | ≤ 15 | ≤ 10 | eslint (complexity rule) |
| Function body length | ≤ 50 lines | ≤ 30 lines | eslint (max-lines-per-function) |
| File length | ≤ 500 lines | ≤ 300 lines | eslint (max-lines) |
| DRY violations (>10L, >85% similar) | 0 | 0 | `.konjo/scripts/dry_check.py` |
| Silent error swallowing | 0 | 0 | eslint / review |
| Known CVEs in dependencies | 0 | 0 | `npm audit` |
| Secrets in tree | 0 | 0 | pre-commit secret scan |

---

## Before Writing Any Code

1. **State the purpose in one sentence.** If you can't state it clearly, don't write it.
2. **Search the codebase first.** `rg "similarFunction"` before writing a new one. If it exists: extend it.
3. **Write the test first** for anything non-trivial.
4. Check: could this be a function on an existing module? Could an existing util do it?

---

## Zero-Tolerance Rules

These cause a CI BLOCKER. No exceptions. No `--no-verify`.

**All code:**
- Dead code (functions, variables, imports never used)
- Commented-out code (3+ consecutive commented lines)
- TODO/FIXME/HACK in production code
- Silent error swallowing (`catch {}` with no log/rethrow)
- Duplicate code blocks (>10 lines, >85% similar) — abstract into a shared function
- Tests that test implementation rather than behavior
- Secrets committed (tokens, client secrets, API keys)

**Node-specific:**
- `require()` in `src/` (ESM only)
- Callback-style Google API calls (await the promise form)
- `setTimeout`-based control flow (wait on real conditions)
- Mutating a fixture to make a test pass

---

## The Ten Review Questions (Wall 3 will ask all of these)

1. **Q1 Correctness** — Does this do what it claims? Off-by-ones, index-math errors, race conditions?
2. **Q2 Coverage Blind Spots** — What inputs cause silent failure the tests won't catch? Error paths tested?
3. **Q3 Dead Code** — Any unreachable code, unused variable, commented-out block? Zero tolerance.
4. **Q4 Documentation** — Public surfaces documented? README/DEPLOY match the implementation?
5. **Q5 Error Handling** — Any swallowed errors? Fallbacks that mask real failures?
6. **Q6 DRY** — Any block of logic appearing >once at >85% similarity over >10 lines?
7. **Q7 Complexity** — Any function >50 lines, >15 complexity, any file >500 lines?
8. **Q8 Security** — Open endpoint? Logging secrets? Missing input validation? Missing API-key guard?
9. **Q9 Performance** — Unbounded scrape timeout? Browser not closed on error? Needless API round-trips?
10. **Q10 Konjo Standard** — Is this seaworthy unattended on Cloud Run for 30 days? What would you cut?

---

## Running the Gates Locally

```bash
# Wall 1 equivalent (run before every commit):
npm run lint
npx prettier --check "src/**/*.js" "test/**/*.js"
npm test
npm audit

# Coverage check:
npm test -- --coverage

# DRY check:
python3 .konjo/scripts/dry_check.py --staged-only

# Wall 3 preview (requires ANTHROPIC_API_KEY):
git diff HEAD~1 | python3 .konjo/scripts/konjo_review.py
```

---

## Test Requirements

Every code module should have a corresponding test. The **formatter is the Crown Jewels** — its
regression test (`test/formatter.test.js` vs `test/formatter.fixture.json`) is mandatory and must
never be weakened. Tests test BEHAVIOR (observable outputs), not implementation details. Never mock
the thing under test; only mock the network / Google API.

---

## Install the Framework in a New Repo

```bash
cp -r /path/to/songscraper/.konjo /path/to/target-repo/
bash .konjo/scripts/install-hooks.sh
# Add ANTHROPIC_API_KEY to GitHub Actions secrets for Wall 3
```
