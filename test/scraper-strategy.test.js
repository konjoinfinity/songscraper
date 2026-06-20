import {
  extractChordText,
  readFirst,
  isRetryableScrapeError,
  cleanTitle,
  joinDistinctArtists,
  buildDocTitle,
} from '../src/scraper.js';

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

  it('heuristic: defers to the selector when the heuristic hit is not a plausible chart', async () => {
    // A block that clears the score threshold (one chord + a section header) yet is
    // not a real chart (only one chord line). The plausibility net must hand off to
    // the selector rather than ship the thin hit.
    const thin = '[Verse]\nG\nsome lyric words here\nmore lyric words\nand even more words';
    const page = makePage({ candidates: [{ tag: 'div', text: thin }], selectorParts: [CHART] });
    const text = await extractChordText(page, 'heuristic', 5);
    expect(text).toBe(CHART);
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

describe('cleanTitle', () => {
  it('strips the trailing " Chords" and surrounding whitespace', () => {
    // Real <h1> shapes: "Despacito Chords ", "Hurt Chords " (note the trailing space).
    expect(cleanTitle('Despacito Chords ')).toBe('Despacito');
    expect(cleanTitle('Hurt Chords ')).toBe('Hurt');
    expect(cleanTitle('99 Luftballons Chords')).toBe('99 Luftballons');
  });
  it('only strips a trailing "Chords", not the word inside a title', () => {
    expect(cleanTitle('The Lost Chord Chords ')).toBe('The Lost Chord');
  });
  it('handles empty / missing input', () => {
    expect(cleanTitle('')).toBe('');
    expect(cleanTitle(null)).toBe('');
  });
});

describe('joinDistinctArtists', () => {
  it('rebuilds a feat. credit split across links (Despacito)', () => {
    // Real artist-link texts: the connector is baked into the first link.
    expect(joinDistinctArtists(['Luis Fonsi feat. ', 'Daddy Yankee'])).toBe(
      'Luis Fonsi feat. Daddy Yankee'
    );
  });
  it('de-duplicates a repeated single artist link', () => {
    expect(joinDistinctArtists(['Misc Children', 'Misc Children', 'Misc Children'])).toBe(
      'Misc Children'
    );
    expect(joinDistinctArtists(['Johnny Cash'])).toBe('Johnny Cash');
  });
  it('ignores blank links and empty input', () => {
    expect(joinDistinctArtists(['', '  ', 'Nena'])).toBe('Nena');
    expect(joinDistinctArtists([])).toBe('');
  });
});

describe('buildDocTitle', () => {
  it('joins title and artist with " - " (placeholder style)', () => {
    expect(buildDocTitle('Hurt', 'Johnny Cash')).toBe('Hurt - Johnny Cash');
    expect(buildDocTitle('Despacito', 'Luis Fonsi feat. Daddy Yankee')).toBe(
      'Despacito - Luis Fonsi feat. Daddy Yankee'
    );
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
    expect(isRetryableScrapeError(new Error('net::ERR_NETWORK_CHANGED at https://ug/x'))).toBe(
      true
    );
  });

  it('does not retry other failures', () => {
    expect(isRetryableScrapeError(new Error('Drive copy did not return a document id'))).toBe(
      false
    );
    expect(isRetryableScrapeError(null)).toBe(false);
  });
});
