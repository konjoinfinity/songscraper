---
name: konjo-boot
description: Boot a Konjo session for songscraper. Produces a Session Brief, runs Discovery, identifies the next sprint. Use at the start of any work session or when invoked with /konjo.
user-invocable: true
---
# Konjo Session Boot — songscraper

## Step 1 — Read
Read in order: CLAUDE.md, README.md, DEPLOY.md, and any open PLAN/TODO notes.
Do not skip. Do not assume contents.

## Step 2 — Session Brief
```
REPO         songscraper — headless Node service: Ultimate Guitar → formatted Google Doc, on Cloud Run
LAST SHIPPED [most recent meaningful change from git log]
OPEN WORK    [stated next steps / unchecked acceptance criteria]
BLOCKERS     [failing tests, rotted UG selectors, missing OAuth setup, broken build]
HEALTH       [Green / Yellow / Red — one line]
```
Unknown is stated as unknown. Fabricated state is a lie to the next session.

## Step 3 — Discovery (कोहजो)
Before executing any sprint, ask:
- Has Ultimate Guitar changed its markup since the selectors were last pinned (`src/config.js`)?
- Are there Puppeteer / headless-Chrome / Cloud Run changes that affect the container?
- Have googleapis or Google OAuth policies changed (refresh-token expiry, consent-screen rules)?
- What would an engineer building this today know that this repo doesn't reflect?

## Step 4 — Identify Work
If a plan exists: load it, validate against the codebase, flag drift.
If drift found:
```
PLAN DRIFT
  ✗ [item] appears completed — not marked done
  ✗ [item] references [module] that no longer exists
  CORRECTED NEXT STEP: [what actually needs to happen]
```
If no plan: run the Discovery Protocol → propose a sprint:
```
PROPOSED SPRINT  [N — Name]
MOTIVATION       [real problem, real user, real value]
RESEARCH         [findings informing this sprint]
DELIVERABLES     [concrete, shippable, verifiable things]
SUCCESS CRITERIA [tests, container build, scrape working end-to-end]
SCOPE / RISKS    [Small / Medium / Large — what could block this]
```
Small/Medium: propose and proceed. Large or irreversible: propose and confirm.

## Invocation Keywords
This skill activates on any of:
- `konjo`
- `konjo songscraper`
- `songscraper konjo`
- `read KONJO_PROMPT.md and begin`
