import { extractChordText } from '../src/scraper.js';

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
