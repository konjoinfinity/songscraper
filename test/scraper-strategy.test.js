import { extractChordText, readFirst, isRetryableScrapeError } from '../src/scraper.js';

// A strong chord-chart candidate (chords-above-lyrics with section headers).
const CHART = `[Verse 1]
G                 D
White lips, pale face
Em                C
Breathing in the snowflakes

[Chorus]
Em   C   G   D
Oh, oh, oh
Em   C       G   D
You're my everything`;

// A low-content block that should not clear the score threshold.
const LOW = `hello world
just some text
nothing musical
plain prose here`;

const SELECTOR_TEXT = 'SELECTOR-SOURCED CHART TEXT';

// Minimal fake of a Puppeteer Page:
//  - evaluate(fn): returns canned candidate blocks for the heuristic path.
//  - $$eval(sel, fn): returns an array of strings (readJoined joins them).
function makePage({ candidates = [], selectorParts = [SELECTOR_TEXT] }) {
  return {
    evaluate: () => Promise.resolve(candidates),
    $$eval: () => Promise.resolve(selectorParts),
  };
}

describe('extractChordText — strategy wiring', () => {
  it('heuristic: returns the heuristic match (not the selector) for a strong chart', async () => {
    const page = makePage({ candidates: [{ tag: 'pre', text: CHART }] });
    const text = await extractChordText(page, 'heuristic', 5);
    expect(text).toBe(CHART);
  });

  it('heuristic: falls back to the selector when nothing clears minScore', async () => {
    // Best candidate exists but its score is below an impossibly-high threshold.
    const page = makePage({ candidates: [{ tag: 'pre', text: CHART }] });
    const text = await extractChordText(page, 'heuristic', 9999);
    expect(text).toBe(SELECTOR_TEXT);
  });

  it('heuristic: falls back to the selector when the only candidate is low-content', async () => {
    const page = makePage({ candidates: [{ tag: 'div', text: LOW }] });
    const text = await extractChordText(page, 'heuristic', 5);
    expect(text).toBe(SELECTOR_TEXT);
  });

  it('auto: returns the selector text without needing the heuristic', async () => {
    // No candidates at all — proves the heuristic was not required.
    const page = makePage({ candidates: [] });
    const text = await extractChordText(page, 'auto', 5);
    expect(text).toBe(SELECTOR_TEXT);
  });

  it('selector: returns selector text only (legacy behavior)', async () => {
    const page = makePage({ candidates: [{ tag: 'pre', text: CHART }] });
    const text = await extractChordText(page, 'selector', 5);
    expect(text).toBe(SELECTOR_TEXT);
  });
});

describe('readFirst — single-valued field reads', () => {
  it('returns the first match when a selector repeats (e.g. the artist link)', async () => {
    // UG renders the artist link several times; readJoined would duplicate it.
    const page = makePage({ selectorParts: ['Misc Children', 'Misc Children', 'Misc Children'] });
    expect(await readFirst(page, 'a[href*="/artist/"]')).toBe('Misc Children');
  });

  it('returns an empty string when nothing matches', async () => {
    const page = makePage({ selectorParts: [] });
    expect(await readFirst(page, 'h1')).toBe('');
  });
});

describe('isRetryableScrapeError', () => {
  it('retries transient empty-block and anti-bot failures', () => {
    expect(isRetryableScrapeError(new Error('Scrape returned an empty chord block — ...'))).toBe(
      true
    );
    expect(isRetryableScrapeError(new Error('Blocked by anti-bot protection (Cloudflare).'))).toBe(
      true
    );
  });

  it('does not retry other failures', () => {
    expect(isRetryableScrapeError(new Error('Drive copy did not return a document id'))).toBe(
      false
    );
    expect(isRetryableScrapeError(undefined)).toBe(false);
  });
});
