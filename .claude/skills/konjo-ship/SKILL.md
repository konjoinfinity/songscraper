---
name: konjo-ship
description: Konjo sprint completion checklist and session handoff template for songscraper. Use when closing out a sprint or ending a work session.
user-invocable: true
---
# Konjo Ship — songscraper

## Sprint Completion Checklist

A sprint is not complete until every one of these is true:

```
[ ] All success criteria met
[ ] All tests pass — `npm test` green, zero failures (formatter regression included)
[ ] `npm run lint` clean
[ ] `npm audit` — zero high/critical advisories
[ ] README.md / DEPLOY.md reflect current state — no stale claims, no missing capabilities
[ ] Zero debug artifacts, dead code, or leftover scaffolding (no stray console.log spam)
[ ] No secrets committed — .env / creds.json / token.json / refresh tokens out of the tree
[ ] git add && git commit -m "type(scope): description" && git push
```

A sprint that is "basically done" is not done. Ship clean or don't ship.

## Execute Checklist

*ᨀᨚᨐᨚ — Build the ship. Make it seaworthy.*

```
PLAN    — write the implementation steps before touching code
BUILD   — one step at a time, logical commits
TEST    — run existing tests, write new ones, fix failures immediately
REVIEW  — re-read everything just written — is it beautiful? is it lean? is it Konjo?
ITERATE — when something breaks, go back to the source — no papering over
SHIP    — all tests pass, docs updated, then push
```

When things break — apply *根性*:
- **Test fails** — analyze at root. State the flaw precisely. Fix it. No apologies.
- **Formatter regression fails** — the refactor changed behavior. Fix the formatter, never the fixture.
- **Scrape returns nothing** — the UG selectors likely rotted. Re-pin them in `src/config.js`.

## Session Handoff Template

```
SHIPPED      [what was completed this session]
TESTS        [passing / failing / count]
PUSHED       [commit hash or "not pushed — reason"]
NEXT SESSION [the exact next task — not "continue the work"]
DISCOVERIES  [UG markup changes, dependency updates worth revisiting]
HEALTH       [Green / Yellow / Red — one line]
```

Every session is a step toward something larger. Make the handoff count.
*Mahiberawi Nuro — we build together. Leave the work ready for the next person.*
