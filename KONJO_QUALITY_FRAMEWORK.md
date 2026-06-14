# Konjo Code Quality Framework
## Three Walls Against AI Slop — Gate-Enforced

**Scope:** All KonjoAI repositories and any project using Claude Code.
**This copy:** retargeted for songscraper (Node 22 · Puppeteer · googleapis · Express).

---

## The Problem

Research makes the failure mode measurable:

- AI-assisted code generates **1.7× more logical and correctness bugs** than traditional development (CodeRabbit 2026)
- AI agents change tests so broken code passes instead of fixing the actual code (Baltes, Cheong, Treude 2026)
- AI agent commits degraded the Maintainability Index in **56.1% of commits** and increased Cyclomatic Complexity in **42.7%** (MSR 2026)
- **Homogeneous AI review pipelines echo rather than cancel errors** — an agent reviewing its own output shares its training distribution and exhibits correlated failures (arXiv 2603.25773)
- Pass-rate benchmarks **systematically undermeasure extension robustness** — agent code deteriorates under repeated editing (SlopCodeBench, arXiv 2603.24755)

**The conclusion:** a single-model self-review loop cannot catch its own slop. The only solutions are
(1) executable specifications as external ground truth, (2) deterministic tooling that cannot be
reasoned past, and (3) adversarial review from a distinct session. All three are enforced here.

---

## The Four Walls

```
Wall 0: End-of-Prompt Sweep ← after every code-modifying Claude response
Wall 1: Pre-Commit Hook     ← local, fast (< 60s), blocks the commit
Wall 2: CI Gate             ← GitHub Actions, blocks the PR merge
Wall 3: Konjo Review Agent  ← Claude in a separate session, blocks the merge
```

No bypass flags. No `--no-verify`. No `skip-review` comments.

---

## Quality Gate Reference Table

All thresholds are enforced by CI. "Hard Block" = PR cannot merge.

| Gate | Hard Block | Target | Tool (Node) |
|------|-----------|--------|-------------|
| Line coverage | ≥ 80% | ≥ 95% | jest --coverage / c8 |
| Lint violations | 0 | 0 | eslint -D |
| Format violations | 0 | 0 | prettier --check |
| Dead code | 0 | 0 | eslint no-unused-vars / knip |
| Undocumented public surfaces | 0 | 0 | review / jsdoc |
| Cyclomatic complexity per function | ≤ 15 | ≤ 10 | eslint complexity |
| Function body length | ≤ 50 lines | ≤ 30 lines | eslint max-lines-per-function |
| File length | ≤ 500 lines | ≤ 300 lines | eslint max-lines |
| DRY violations (>10L, >85% similar) | 0 | 0 | dry_check.py |
| Silent error swallowing | 0 | 0 | review / eslint |
| Known CVEs in dependencies | 0 | 0 | npm audit |
| Secrets in tree | 0 | 0 | pre-commit secret scan |

---

## Wall 0: End-of-Prompt Cleanup Sweep

**Trigger:** after every Claude response that wrote, edited, or deleted source code.
Zero-tolerance checks: function > 50 lines, file > 500 lines, TODO/FIXME/HACK, swallowed `catch {}`,
stray `console.log` debug spam, 3+ consecutive commented-out lines, `require()` in `src/`,
callback-style Google calls, `setTimeout` control flow. Catch it the moment it's introduced.

---

## Wall 1: Pre-Commit Hook

**File:** `.konjo/hooks/pre-commit` · **Install:** `bash .konjo/scripts/install-hooks.sh` · **Runtime:** < 60s

For Node repos (this one), it runs on staged `.js`:
- `eslint` on staged files — zero violations
- `prettier --check` on staged files — zero format violations
- swallowed-error scan (`catch {}` / empty catch) — hard block
- secret scan (private keys, `client_secret`, refresh-token literals) — hard block

Universal (all staged files): file-size warn (> 500 lines), DRY check (staged only), TODO/FIXME scan.
Wall 3 preview runs if `ANTHROPIC_API_KEY` is set (advisory at pre-commit).

---

## Wall 2: CI Gate (GitHub Actions)

Triggers: all PRs to main, push to main. Gates:

### G1 — Static Analysis
`prettier --check` · `eslint -D` (zero warnings) · `npm audit` (zero high/critical) · dead-code zero-tolerance.

### G2 — Tests + Coverage
`npm test -- --coverage` with the coverage gate at 80% (ratchets toward 95%). The formatter regression
test is part of this gate.

### G3 — Complexity + Size + DRY
eslint `complexity`/`max-lines`/`max-lines-per-function` · `dry_check.py` (0 violations).

### G4 — Adversarial Review (PRs only)
`konjo_review.py` in an independent Claude session · the ten mandatory questions · BLOCKER blocks merge.

---

## Wall 3: Konjo Adversarial Review

The critic must not match the builder's session. It asks the ten mandatory questions and returns a
structured `APPROVED` / `WARNING` / `BLOCKER` verdict, posted as a PR comment.

| # | Question | BLOCKER if |
|---|----------|-----------|
| Q1 | Correctness — logical errors, index-math errors, race conditions | any found |
| Q2 | Coverage blind spots — untested inputs, silent failures | critical paths uncovered |
| Q3 | Dead code — unreachable, unused, commented-out | any found |
| Q4 | Documentation — public surfaces documented, behavior explained | any undocumented |
| Q5 | Error handling — no swallowed errors, browser always closed | any found |
| Q6 | DRY — no duplicate blocks >10L at >85% similarity | any found |
| Q7 | Complexity — no function >50L, no file >500L, complexity ≤ 15 | any exceeded |
| Q8 | Security — no open endpoint, no logged secrets, input validated | any found |
| Q9 | Performance — bounded scrape timeout, no needless API round-trips | in hot paths |
| Q10 | Konjo Standard — seaworthy unattended on Cloud Run for 30 days? | ship would sink |

---

## Installing the Framework in a New Repo

```bash
cp -r /path/to/songscraper/.konjo /path/to/target-repo/
cp -r /path/to/songscraper/.claude/skills/konjo-quality /path/to/target-repo/.claude/skills/
cp -r /path/to/songscraper/.claude/skills/konjo-retrofit /path/to/target-repo/.claude/skills/
cd /path/to/target-repo && bash .konjo/scripts/install-hooks.sh
# Add ANTHROPIC_API_KEY to GitHub Actions secrets, then test:
git commit --allow-empty -m "test: verify konjo pre-commit hook"
```

---

*건조. 根性. Make it Konjo — build, ship, repeat.*
