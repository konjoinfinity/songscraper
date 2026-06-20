import {
  isChordToken,
  classifyLine,
  analyzeChordText,
  scoreChordText,
  pickBestCandidate,
  looksLikePageChrome,
  isChordLegend,
  isPlausibleChart,
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
  it('does not treat an annotation-only line as a chord line', () => {
    // Version/rating counts and bare repeat marks have no real chord — they must
    // not read as chord lines (else a page fragment can out-score a tiny chart).
    expect(classifyLine('(15)')).toBe('lyric');
    expect(classifyLine('(146)   (251)   (29)')).toBe('lyric');
    // A real chord with an annotation alongside is still a chord line.
    expect(classifyLine('| D | D | C | x4')).toBe('chord');
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

// A bare chord-diagram legend (UG's "chords used" fingering list), one chord per
// line. Real shape that beat the chart on the Happy Cats "Autumn Leaves" page:
// the legend's perfect chart-line density out-weighed the lyric-diluted chart.
const CHORD_LEGEND = 'Am\nDm7\nG\nCmaj7\nFmaj7\nE7\nDm';

// A whole-page container: UG nav + toolbar + a buried mini-chart + comments +
// footer. Real shape that beat the clean <pre> on the "Row Row Row Your Boat" page
// (raw score 58 from chord-letters scattered through the chrome).
const PAGE_CHROME = [
  'Tabs',
  'Courses',
  'Songbooks',
  'Download PDF',
  'Autoscroll',
  'Tuning: E A D G B E Capo: No capo',
  'G          G              G                G',
  'Row, row, row your boat, gently down the stream',
  ' C                 G                D             G',
  'merrily, merrily, merrily, merrily life is but a dream.',
  'Create correction',
  'Report bad tab',
  'More Versions',
  'Privacy Policy',
  'Ultimate-Guitar.com',
  'All rights reserved',
].join('\n');

describe('looksLikePageChrome', () => {
  it('flags a block littered with UG page-chrome phrases', () => {
    expect(looksLikePageChrome(PAGE_CHROME)).toBe(true);
  });
  it('does not flag a real chart, a legend, or empty text', () => {
    expect(looksLikePageChrome(CHART)).toBe(false);
    expect(looksLikePageChrome(CHORD_LEGEND)).toBe(false);
    expect(looksLikePageChrome('')).toBe(false);
  });
});

describe('isChordLegend', () => {
  it('flags an all-chord, no-lyric, no-section block', () => {
    expect(isChordLegend(analyzeChordText(CHORD_LEGEND))).toBe(true);
  });
  it('does not flag a real chart (it carries lyric/section lines)', () => {
    expect(isChordLegend(analyzeChordText(CHART))).toBe(false);
  });
});

describe('pickBestCandidate — wrong-block regressions', () => {
  // Autumn Leaves: the chord-diagram legend (a separate block) must lose to the
  // real chart even though its density is a perfect 1.0.
  it('picks the real chart over a higher-density chord legend', () => {
    const best = pickBestCandidate([
      { tag: 'div', text: CHORD_LEGEND },
      { tag: 'pre', text: CHART },
    ]);
    expect(best.text).toBe(CHART);
  });

  // Row Row Row Your Boat: on the live page the whole-page chrome container
  // out-scored the clean chart on raw count (score 58 vs 7); the chrome guard must
  // disqualify it — regardless of score — so the chart wins.
  it('picks the clean chart over a page-chrome container', () => {
    const best = pickBestCandidate([
      { tag: 'div', text: PAGE_CHROME },
      { tag: 'pre', text: CHART },
    ]);
    expect(best.text).toBe(CHART);
  });

  // Row Row Row Your Boat again: a 2-line children's chart in a <pre> is out-scored
  // on raw count by <div> page fragments (the A–Z artist index; the version list).
  // The <pre> tier must win regardless — the chart always lives in a <pre>.
  it('prefers a scoring <pre> chart over higher-scoring <div> decoys', () => {
    const tinyChart = [
      'G          G              G                G',
      'Row, row, row your boat, gently down the stream',
      ' C                 G                D             G',
      'merrily, merrily, merrily, merrily life is but a dream.',
    ].join('\n');
    // The A–Z artist index (footer nav): single capitals, A–G of which read as chords.
    const azIndex = 'A\nB\nC\nD\nE\nF\nG\nH\nI\nJ\nK\nL\nM\nN';
    expect(scoreChordText(azIndex)).toBeGreaterThan(scoreChordText(tinyChart));
    const best = pickBestCandidate([
      { tag: 'div', text: azIndex },
      { tag: 'pre', text: tinyChart },
    ]);
    expect(best.text).toBe(tinyChart);
  });

  // When the only candidate is a legend or page chrome, return null so the caller
  // falls back to the CSS selector rather than scraping the wrong block.
  it('returns null when every candidate is a legend or page chrome', () => {
    expect(
      pickBestCandidate([
        { tag: 'div', text: CHORD_LEGEND },
        { tag: 'div', text: PAGE_CHROME },
      ])
    ).toBeNull();
  });
});

describe('isPlausibleChart', () => {
  it('accepts a real chords-over-lyrics chart', () => {
    expect(isPlausibleChart(CHART)).toBe(true);
  });
  it('rejects a bare legend, prose, a one-line header, and empty', () => {
    expect(isPlausibleChart(CHORD_LEGEND)).toBe(false); // chords only, no lyrics/sections
    expect(isPlausibleChart(BIO)).toBe(false);
    expect(isPlausibleChart('Blackbird chords  The Beatles 1968')).toBe(false);
    expect(isPlausibleChart('')).toBe(false);
  });
  it('accepts a chord-only chart that still carries section labels', () => {
    expect(isPlausibleChart('[Intro]\nG  C  D\n[Solo]\nEm  C  G  D')).toBe(true);
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
