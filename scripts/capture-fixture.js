// Regenerates the formatter golden fixture (test/formatter.fixture.json) by
// running the REAL formatter over the embedded sample chart — no inlined copy of
// the logic, so the golden always reflects shipped behavior (anti-mock rule).
//
// Run: npm run fixture
//
// The fixture captures buildReplaceRequests() — the title + col1 + col2
// replaceAllText payload, which encodes the entire section-aware layout. Assumes
// the default FORMAT_COLUMN_LINE_BUDGET; regenerate only with explicit sign-off.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFormatter } from '../src/formatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const rawText = readFileSync(join(repoRoot, 'test', 'fixtures', 'sample-chart.txt'), 'utf8');
const title = 'The A Team- Ed Sheeran';

const { buildReplaceRequests } = createFormatter({ rawText, title });
const fixture = {
  description:
    'Golden replaceAllText payload from the section-aware formatter (src/formatter.js), ' +
    'captured by scripts/capture-fixture.js over test/fixtures/sample-chart.txt. ' +
    'Assumes the default FORMAT_COLUMN_LINE_BUDGET. Regenerate only with explicit sign-off.',
  input: { rawText, title },
  requests: buildReplaceRequests(),
};

const out = join(repoRoot, 'test', 'formatter.fixture.json');
writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`);
console.log(`Wrote ${out}`);
