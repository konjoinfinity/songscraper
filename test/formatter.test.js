import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createFormatter } from '../src/formatter.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(__dirname, 'formatter.fixture.json'), 'utf8'));

/** A fake re-read paragraph: one element with the given content + indices. */
function makeLine(content, startIndex, endIndex) {
  return { paragraph: { elements: [{ startIndex, endIndex, textRun: { content } }] } };
}

describe('formatter — replace pass (pass 1)', () => {
  it('emits exactly title, col1, and col2 replaceAllText requests with exact placeholders', () => {
    const { buildReplaceRequests } = createFormatter({
      rawText: '[Verse 1]\nG  C\nhello there',
      title: 'Song- Artist',
    });
    const requests = buildReplaceRequests();
    const placeholders = requests.map((r) => r.replaceAllText.containsText.text);
    expect(placeholders).toEqual(['Song Title - Artist Name', 'col1', 'col2']);
    for (const r of requests) {
      expect(r.replaceAllText.containsText.matchCase).toBe(true);
    }
    const titleReq = requests[0];
    expect(titleReq.replaceAllText.replaceText).toBe('Song- Artist');
  });

  it('separates cell lines with \\n, never \\r\\n, and decides no bold here', () => {
    const { buildReplaceRequests } = createFormatter({
      rawText: '[Verse 1]\nG  C\nhello there\n[Chorus]\nD  Em\nla la la',
      title: 'T- A',
    });
    const requests = buildReplaceRequests();
    const col1Text = requests[1].replaceAllText.replaceText;
    expect(col1Text).toContain('\n');
    expect(col1Text).not.toContain('\r');
    expect(requests.some((r) => r.updateTextStyle)).toBe(false);
  });
});

describe('formatter — style pass (pass 2)', () => {
  it('bolds chord/section paragraphs and leaves lyric paragraphs unbold, by order', () => {
    const { buildStyleRequests } = createFormatter({
      rawText: '[Verse 1]\nG  C\nhello there',
      title: 'T- A',
    });
    // col1 rendered lines are: section "Verse 1", chord "G  C", lyric "hello there".
    const col1Content = [
      makeLine('Verse 1\n', 10, 18),
      makeLine('G  C\n', 18, 23),
      makeLine('hello there\n', 23, 35),
    ];
    const requests = buildStyleRequests(col1Content, null);
    expect(requests.map((r) => r.updateTextStyle.textStyle.bold)).toEqual([true, true, false]);
    expect(requests[2].updateTextStyle.range).toEqual({ startIndex: 23, endIndex: 35 });
  });

  it('stays aligned past a stray leading empty paragraph (no off-by-one mis-bold)', () => {
    const { buildStyleRequests } = createFormatter({
      rawText: '[Verse 1]\nG  C\nhello there',
      title: 'T- A',
    });
    const col1Content = [
      makeLine('', 9, 9), // stray empty paragraph Docs may leave before the text
      makeLine('Verse 1\n', 10, 18),
      makeLine('G  C\n', 18, 23),
      makeLine('hello there\n', 23, 35),
    ];
    const requests = buildStyleRequests(col1Content, null);
    expect(requests.map((r) => r.updateTextStyle.textStyle.bold)).toEqual([true, true, false]);
    expect(requests[0].updateTextStyle.range).toEqual({ startIndex: 10, endIndex: 18 });
  });

  it('skips zero-length (empty trailing) paragraphs', () => {
    const { buildStyleRequests } = createFormatter({
      rawText: '[Verse 1]\nG  C\nhello there',
      title: 'T- A',
    });
    const col1Content = [
      makeLine('Verse 1\n', 10, 18),
      makeLine('', 18, 18), // zero-length → skipped
      makeLine('hello there\n', 18, 30),
    ];
    const requests = buildStyleRequests(col1Content, null);
    expect(requests).toHaveLength(2);
  });
});

describe('formatter — golden regression', () => {
  it('reproduces the committed replaceAllText payload for the sample chart', () => {
    const { buildReplaceRequests } = createFormatter(fixture.input);
    expect(buildReplaceRequests()).toEqual(fixture.requests);
  });
});
