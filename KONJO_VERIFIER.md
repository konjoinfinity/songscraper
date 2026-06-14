# Konjo Verifier

> *Grade the work against intent — and against an explicit rubric — before opening a PR.*

## What it is

The Konjo Verifier is a second-score pass that runs **after** the heuristic checks pass (tests green,
lint clean). It sends the goal, the diff, and the test output to a distinct Claude session with a
developer-supplied rubric, and receives a structured verdict before the change is shipped.

A passing heuristic score is necessary but not sufficient. The Verifier asks the higher-order question:
**does this diff actually accomplish what was asked, and does it meet the team's quality criteria?**

## How it works

```
Plan → Implement → Test → [Score: heuristic pass?] → [Verifier: rubric pass?] → Commit → PR
                                                            ↓ fail
                                                   append fix_hints to constraints
                                                            ↓
                                                         Retry
```

The verifier is called with:
- **Goal** — the original task description
- **Plan excerpt** — the agent's intended steps
- **Diff excerpt** — the git diff
- **Test output** — the heuristic scorer's errors/output
- **Rubric** — an ordered list of criteria to check

It returns a structured JSON verdict:

```json
{
  "passed": false,
  "gaps": ["No test covers the refresh-token-missing branch in google/auth.js"],
  "fix_hints": ["Add a test asserting a 500 with a clear message when REFRESH_TOKEN is unset"],
  "confidence": 0.87
}
```

On failure, `fix_hints` become hard requirements in the next planning prompt, and the agent retries.

## Rubrics

Canonical rubrics ship at `.konjo/rubrics/`:

| File | When to use |
|------|-------------|
| `feature_completeness.toml` | New feature implementation tasks (default fallback) |
| `refactor_safety.toml` | Refactors where no observable behavior should change — **e.g. the formatter migration** |
| `security_audit.toml` | Security hardening: the API-key guard, OAuth flow, input validation |

### Rubric format

```toml
name = "my_rubric"

criteria = [
  "All existing tests still pass",
  "The stated goal is fully implemented",
  "No debugging artefacts remain in the diff",
]
```

For the songscraper formatter migration, `refactor_safety.toml` is the right rubric: the refactored
`src/formatter.js` must produce a payload equivalent to the captured legacy payload, with no public
behavior change and no fixture edits.

## The Konjo brand position

Competitors produce code that passes tests. Konjo produces code that passes tests *and* satisfies your
explicit quality criteria, with a receipts trail. That's the difference between "automated" and
"provably correct by your standards."
