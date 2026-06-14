---
paths:
  - "**/benchmarks/**"
  - "**/*.bench.js"
  - "**/perf/**"
---
# Benchmarking Rules

- Minimum 5 warmup runs before timing. Discard warmup in reported metrics.
- Report p50, p95, p99, stddev — not just mean.
- Document the environment completely: Node version, container limits (CPU/memory), Cloud Run region,
  cold vs. warm start, network conditions.
- For the scrape path, measure end-to-end latency (navigate → scrape → doc created) and separate the
  Puppeteer launch / page-load cost from the Google API cost.
- Results → `benchmarks/results/<timestamp>_<name>/`. Never overwrite — always a new directory.
- Regression gate: >5% p95 latency or >10% peak memory = hard stop, profile and fix before merging.
