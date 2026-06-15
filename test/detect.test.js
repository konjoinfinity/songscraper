import {
  isChordToken,
  classifyLine,
  analyzeChordText,
  scoreChordText,
  pickBestCandidate,
  parseTitleFromDocTitle,
} from '../src/detect.js';

// A realistic chord chart (chords-above-lyrics, section headers).
const CHART = `[Intro]
G   D   Em   C

[Verse 1]
G                 D
White lips, pale face
Em                C
Breathing in the snowflakes
G               D
Burning lungs, the city

[Chorus]
Em   C   G   D
Oh, oh, oh
Em   C       G   D
You're my everything`;

// Decoy 1: a prose bio that happens to mention notes/letters.
const BIO = `Ed Sheeran is an English singer and songwriter.
Born in Halifax and raised in Framlingham, he learned guitar
at a young age and moved to London in 2008 to pursue music.
He has sold more than 150 million records worldwide and is
one of the best-selling music artists of his generation.`;

// Decoy 2: a navigation / UI block.
const NAV = `Home
Explore
Top Tabs
Submit Tab
Sign In
Favorites
Settings`;

describe('isChordToken', () => {
  it('accepts real chords incl. extensions and slash bass', () => {
    for (const t of ['G', 'Am', 'C#m7', 'Dsus4', 'G/B', 'Cadd9', 'F#dim', 'N.C.', 'x4', '|']) {
      expect(isChordToken(t)).toBe(true);
    }
  });

  it('rejects A–G English words and lowercase tokens', () => {
    for (const t of ['Bad', 'Cab', 'Add', 'Face', 'Dad', 'Bag', 'and', 'the', 'snowflakes']) {
      expect(isChordToken(t)).toBe(false);
    }
  });
});

describe('classifyLine', () => {
  it('detects section headers with and without brackets', () => {
    expect(classifyLine('[Verse 1]')).toBe('section');
    expect(classifyLine('Chorus')).toBe('section');
  });
  it('detects chord lines and lyric lines', () => {
    expect(classifyLine('G   D   Em   C')).toBe('chord');
    expect(classifyLine('Em   C       G   D')).toBe('chord');
    expect(classifyLine('White lips, pale face')).toBe('lyric');
  });
});

describe('scoreChordText', () => {
  it('scores a real chart well above prose and nav decoys', () => {
    const chart = scoreChordText(CHART);
    expect(chart).toBeGreaterThan(0);
    expect(chart).toBeGreaterThan(scoreChordText(BIO));
    expect(chart).toBeGreaterThan(scoreChordText(NAV));
  });
  it('scores non-chart text at or near zero', () => {
    expect(scoreChordText(BIO)).toBe(0);
    expect(scoreChordText(NAV)).toBe(0);
    expect(scoreChordText('')).toBe(0);
  });
});

describe('pickBestCandidate', () => {
  it('selects the chart among mixed candidates', () => {
    const best = pickBestCandidate([
      { tag: 'div', text: NAV },
      { tag: 'pre', text: CHART },
      { tag: 'div', text: BIO },
    ]);
    expect(best).not.toBeNull();
    expect(best.text).toBe(CHART);
  });

  it('breaks ties toward the tighter (shorter) block', () => {
    const wrapped = `Some header nav\n\n${CHART}\n\nfooter links here\nmore footer`;
    const best = pickBestCandidate([
      { tag: 'div', text: wrapped },
      { tag: 'pre', text: CHART },
    ]);
    // Same chart content; the tighter <pre> should win on the tie-break path
    // (or simply by higher density). Either way it must not pick the wrapper.
    expect(best.text).toBe(CHART);
  });

  it('returns null when nothing looks like a chart', () => {
    expect(pickBestCandidate([{ tag: 'div', text: BIO }])).toBeNull();
  });

  // Regression for the live-UG over-capture bug: a parent <div> that wraps the
  // chart in a tuning/key preamble scores HIGHER on raw count (the preamble
  // lines read as chords) yet must lose to the tight <pre>. Raw-score selection
  // picked the wrapper; density + the <pre> bonus pick the core chart.
  it('prefers the tight <pre> over a higher-scoring preamble superset', () => {
    // UG's div.innerText concatenates the tuning/key/capo metadata into one line
    // ahead of the chart (this is the real shape that beat the <pre> on raw score
    // in the live validation: div score 77 > pre 75).
    const superset = `Tuning: E A D G B E Key: D Capo: 1st fret\n${CHART}`;
    // The wrapper genuinely out-scores the bare chart on raw count...
    expect(scoreChordText(superset)).toBeGreaterThan(scoreChordText(CHART));
    // ...but selection must still return the tight chart, not the superset.
    const best = pickBestCandidate([
      { tag: 'div', text: superset },
      { tag: 'pre', text: CHART },
    ]);
    expect(best.text).toBe(CHART);
  });

  // The body wrapper on a real page out-scores the chart purely by absorbing the
  // chart's lines plus a lot of low-density nav; density must demote it.
  it('demotes a nav-diluted wrapper that out-scores the chart on raw count', () => {
    const nav = Array.from({ length: 40 }, (_, i) => `Menu link number ${i}`).join('\n');
    const chordLegend = 'G\nC\nD\nEm\nAm\nF'; // chord-diagram labels, one per line
    const wrapper = `${nav}\n${chordLegend}\n${CHART}\n${nav}`;
    expect(scoreChordText(wrapper)).toBeGreaterThan(scoreChordText(CHART));
    const best = pickBestCandidate([
      { tag: 'div', text: wrapper },
      { tag: 'pre', text: CHART },
    ]);
    expect(best.text).toBe(CHART);
  });
});

describe('analyzeChordText', () => {
  it('reports line tallies and a score consistent with scoreChordText', () => {
    const stats = analyzeChordText(CHART);
    expect(stats.score).toBe(scoreChordText(CHART));
    expect(stats.chord).toBeGreaterThan(0);
    expect(stats.section).toBeGreaterThan(0);
    expect(stats.nonBlank).toBeGreaterThanOrEqual(stats.chord + stats.section);
  });
  it('returns an all-zero result for non-chart text', () => {
    expect(analyzeChordText(NAV)).toEqual({
      score: 0,
      chord: 0,
      section: 0,
      aligned: 0,
      nonBlank: 0,
    });
  });
});

describe('parseTitleFromDocTitle', () => {
  it('splits UG-style document titles into title/artist', () => {
    expect(parseTitleFromDocTitle('Wonderwall Chords by Oasis @ Ultimate-Guitar.Com')).toEqual({
      title: 'Wonderwall',
      artist: 'Oasis',
    });
    expect(parseTitleFromDocTitle('Photograph Chords by Ed Sheeran | Ultimate Guitar')).toEqual({
      title: 'Photograph',
      artist: 'Ed Sheeran',
    });
  });
  it('returns null on unrelated titles', () => {
    expect(parseTitleFromDocTitle('Some random page title')).toBeNull();
  });
});
