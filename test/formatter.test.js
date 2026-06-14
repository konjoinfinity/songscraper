import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFormatter } from '../src/formatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'formatter.fixture.json'), 'utf8'));

describe('formatter — Crown Jewels regression', () => {
  it('reproduces the legacy batchUpdate payload exactly', () => {
    const { buildBatchRequests } = createFormatter(fixture.input);
    const requests = buildBatchRequests();
    expect(requests).toEqual(fixture.requests);
  });

  it('keeps the template placeholder strings exact', () => {
    const { buildBatchRequests } = createFormatter(fixture.input);
    const requests = buildBatchRequests();

    const titleReq = requests.find(
      (r) => r.replaceAllText?.containsText?.text === 'Song Title - Artist Name'
    );
    const col2Req = requests.find((r) => r.replaceAllText?.containsText?.text === 'col2');

    expect(titleReq).toBeDefined();
    expect(titleReq.replaceAllText.replaceText).toBe(fixture.input.title);
    expect(col2Req).toBeDefined();
  });

  it('emits no zero-length updateTextStyle ranges', () => {
    const { buildBatchRequests } = createFormatter(fixture.input);
    const requests = buildBatchRequests();
    const empty = requests.filter(
      (r) =>
        r.updateTextStyle && r.updateTextStyle.range.startIndex === r.updateTextStyle.range.endIndex
    );
    expect(empty).toHaveLength(0);
  });
});

describe('formatter — second unbold pass', () => {
  it('unbolds lyric lines and leaves chords/titles bold', () => {
    const { buildBatchRequests, buildUnboldRequests } = createFormatter(fixture.input);
    // Pass 1 must run first to preserve the shared regex state, as in production.
    buildBatchRequests();

    const cellContent = [
      makeLine('Verse 1\n', 100, 108), // section title -> stays bold
      makeLine('White lips, pale face\n', 108, 130), // lyric -> unbold
      makeLine('G   Cadd9   Em\n', 130, 145), // chords -> stays bold
    ];
    const unbold = buildUnboldRequests(cellContent);

    // Exactly one unbold request, for the lyric line.
    expect(unbold).toHaveLength(1);
    expect(unbold[0].updateTextStyle.range.startIndex).toBe(108);
    expect(unbold[0].updateTextStyle.textStyle.bold).toBe(false);
  });
});

function makeLine(content, startIndex, endIndex) {
  return { paragraph: { elements: [{ startIndex, endIndex, textRun: { content } }] } };
}
