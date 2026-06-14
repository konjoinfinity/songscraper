---
paths:
  - "**/test/**"
  - "**/*.test.js"
  - "**/*.spec.js"
---
# Testing Rules

A phase is NEVER complete until all tests pass. `npm test` must be green before `git push`.

**Unit:** deterministic, isolated functions (formatter request-building, URL validation, config parsing).
**Integration:** Google API handoffs (mock the Drive/Docs client; assert the requests we send).
**Regression (Crown Jewels):** `test/formatter.test.js` asserts the refactored formatter produces a
payload equivalent to the captured legacy payload in `test/formatter.fixture.json`. If this fails,
the refactor changed behavior — stop and fix the formatter, do not edit the fixture.

**Anti-mocking rule:** never mock the thing you are testing. The formatter test exercises the real
formatter; only the network/Docs API is mocked.

Never edit a fixture to make a failing test pass. Never commit with known failing tests.
