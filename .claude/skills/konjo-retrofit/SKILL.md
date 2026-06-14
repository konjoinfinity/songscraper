---
name: konjo-retrofit
description: Retrofit the Konjo Quality Framework onto an existing repo that predates it. Use when asked to add konjo quality gates, improve code quality, audit an existing codebase, or run a quality sprint. Provides the step-by-step migration plan and triage protocol.
user-invocable: true
---

# Konjo Retrofit — Existing Repo Quality Migration

## The Problem With Retrofitting Blind

Installing hard quality gates on an existing codebase without measuring first causes one of two outcomes:
1. **Gates fail on day 1** — blocks all work, the team disables the gates in frustration.
2. **Gates set too loose** — they pass everything, provide no value.

The Retrofit Protocol solves this by measuring before gating, then ratcheting up incrementally.

---

## Step 1 — Baseline Audit (measure everything, fix nothing yet)

Run these and save the output. Do not fix violations yet — establish the baseline.

```bash
# Coverage baseline
npm test -- --coverage --coverageReporters=json-summary > coverage_baseline.txt

# Lint baseline
npx eslint "src/**/*.js" -f json > eslint_baseline.json

# Dead code
npx knip > knip_baseline.txt              # unused files / exports / deps

# Complexity (eslint complexity + max-lines-per-function reporting)
npx eslint "src/**/*.js" --rule '{"complexity":["warn",10]}' -f json > complexity_baseline.json

# DRY
python3 .konjo/scripts/dry_check.py --json > dry_baseline.json

# Dependency advisories
npm audit --json > audit_baseline.json

# File sizes
find src test -name "*.js" | xargs wc -l | sort -n | tail -20 > large_files.txt
```

---

## Step 2 — Triage

| Priority | Category | Definition | Handle |
|----------|----------|------------|--------|
| P0 | **CRITICAL** | Secrets in tree, injection surface, auth bypass, data corruption | Fix immediately, before framework install |
| P1 | **DEBT** | Coverage < 60%, swallowed errors, callback Google calls, `setTimeout` control flow | Fix in first 2 sprints |
| P2 | **STYLE** | Length violations, moderate duplication, complexity > 20 | Fix incrementally, 1-2 per sprint |

**Never retrofit CRITICAL and DEBT in the same commit.** Fix P0 first, measure, commit. Then P1.

---

## Step 3 — Install Framework (at current baseline, not ideal baseline)

Install with **warn-only mode** for the first sprint:

```bash
bash .konjo/scripts/install-hooks.sh
# Set coverage gate at: current_coverage - 2% (no regression, but don't block yet)
# Set Wall 3 review to: --soft-fail (report only) for the first week
```

**Rationale:** a gate that fails the day it's installed gets disabled. Set it just above current, then ratchet.

---

## Step 4 — The Coverage Ratchet

| Sprint | Coverage Gate | Action |
|--------|-------------|--------|
| Sprint 0 (install) | current − 2% | No regressions allowed |
| Sprint 1 | current | Hold the line |
| Sprint 2 | current + 5% | Write missing tests |
| Sprint N | 80% | Hard floor (production gate) |
| Long-term | 95% | Target |

Never move the gate backward.

---

## Step 5 — Complexity and Length Ratchet

For each oversized function or file (one at a time):
1. Write a **characterization test** first — capture current behavior before touching anything.
2. Make the smallest refactor that improves the metric.
3. Run the full suite — all tests must pass; coverage must not decrease.
4. Commit: `refactor(scope): extract X into Y [complexity 23→11, lines 80→35]`.

**Never refactor + change behavior in the same commit.** (This is exactly how the songscraper
formatter was migrated: capture the legacy payload as a fixture, then refactor against it.)

---

## Step 6 — DRY Cleanup

Run `dry_check.py --json`, sort by similarity descending, address highest-similarity first. For each:
identify the canonical version, test it, replace duplicates with calls to it, confirm tests pass.

---

## Step 7 — Activate Wall 3 (adversarial review)

After Walls 1 and 2 are stable (≥ 2 consecutive clean CI runs):

```bash
python3 .konjo/scripts/konjo_review.py --soft-fail   # week 1: report only
python3 .konjo/scripts/konjo_review.py               # week 2: blocking
```

Add `ANTHROPIC_API_KEY` to GitHub Actions secrets before enabling.

---

## Node Repo Checklist
- [ ] `npm run lint` clean (eslint)
- [ ] `npx prettier --check` clean
- [ ] `npm audit` zero high/critical advisories
- [ ] `npm test -- --coverage` ≥ 80%
- [ ] `npx knip` zero unused exports/deps
- [ ] No `require()` in `src/`; ESM throughout
- [ ] No secrets in tree; `.gitignore` covers `.env`, `creds.json`, `token.json`
- [ ] `.konjo/` committed; pre-commit hook installed

---

## The Shipbuilder's Checklist (Final Verification)

- [ ] The test suite runs in < 5 minutes
- [ ] A PR that deletes a function without updating its callers would fail CI
- [ ] A PR that drops coverage below 80% would fail CI
- [ ] A PR that changes formatter output without regenerating the fixture would fail CI
- [ ] A PR is reviewed by the Konjo Critic before merge
- [ ] The service can run unattended for 30 days without manual intervention
- [ ] The code can be read and extended by someone who wasn't there when it was written

If any of these are false, the retrofit is not complete.
