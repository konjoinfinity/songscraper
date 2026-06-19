import {
  parseSections,
  compactSection,
  sectionSignature,
  renderFull,
  renderCompressed,
  packColumns,
  buildLayout,
} from '../src/layout.js';

describe('parseSections', () => {
  it('drops preamble before the first heading and splits on headings', () => {
    const chart = ['Capo 2', 'Tuning: standard', '[Intro]', 'G  C', '[Verse 1]', 'a lyric'].join(
      '\n'
    );
    const sections = parseSections(chart);
    expect(sections.map((s) => s.heading)).toEqual(['Intro', 'Verse 1']);
    // The Capo/Tuning preamble is gone.
    expect(JSON.stringify(sections)).not.toMatch(/Capo|Tuning/);
  });

  it('stops at the trailing footer', () => {
    const chart = ['[Intro]', 'G', 'Thanks for using my tab!', 'G  C  D'].join('\n');
    const sections = parseSections(chart);
    expect(sections).toHaveLength(1);
    expect(JSON.stringify(sections)).not.toMatch(/Thanks for using/);
  });

  it('cuts trailing UG chrome (ratings, ads, nav, links, dividers)', () => {
    const chart = [
      '[Verse 1]',
      'G  D',
      'real lyric line',
      '------------------------------------------',
      'I tabbed this myself, enjoy!',
      'https://www.youtube.com/watch?v=abc',
      'X',
      'Print',
      'Create correction',
      'Welcome Offer',
      'Strumming pattern',
      'There is no strumming pattern for this song yet. Create and get +5 IQ',
    ].join('\n');
    const sections = parseSections(chart);
    const dump = JSON.stringify(sections);
    expect(dump).toContain('real lyric line');
    expect(dump).not.toMatch(
      /youtube|Welcome Offer|Strumming pattern|Create correction|tabbed this/
    );
  });

  it('treats a heading-less chart as one untitled section', () => {
    const sections = parseSections(['G  C', 'some words', 'D  Em'].join('\n'));
    expect(sections).toHaveLength(1);
    expect(sections[0].heading).toBeNull();
  });

  it('returns nothing for empty input', () => {
    expect(parseSections('')).toEqual([]);
    expect(parseSections('   \n  ')).toEqual([]);
  });
});

describe('compactSection', () => {
  it('collapses repeated identical chord lines and drops blanks', () => {
    const [section] = parseSections(
      ['[Intro]', 'Em  G  D  A7sus4', 'Em  G  D  A7sus4', ' ', 'Em  G  D  A7sus4'].join('\n')
    );
    const compact = compactSection(section);
    expect(compact.lines).toHaveLength(1);
    expect(compact.lines[0].text.trim()).toBe('Em  G  D  A7sus4');
  });

  it('does not collapse distinct chord lines', () => {
    const [section] = parseSections(['[Intro]', 'Em  G', 'C  D'].join('\n'));
    expect(compactSection(section).lines).toHaveLength(2);
  });
});

describe('sectionSignature', () => {
  it('matches two sections with the same body but different headings', () => {
    const first = compactSection(parseSections(['[Chorus]', 'G  C', 'same words'].join('\n'))[0]);
    const second = compactSection(
      parseSections(['[Chorus 2]', 'G  C', 'Same Words'].join('\n'))[0]
    );
    expect(sectionSignature(first)).toBe(sectionSignature(second)); // lyric case-insensitive
  });

  it('differs when chord case differs (Em != EM)', () => {
    const first = compactSection(parseSections(['[Intro]', 'Em  G'].join('\n'))[0]);
    const second = compactSection(parseSections(['[Intro]', 'EM  G'].join('\n'))[0]);
    expect(sectionSignature(first)).not.toBe(sectionSignature(second));
  });
});

describe('renderFull / renderCompressed', () => {
  it('renders a single-progression chord-only section as a dashed one-liner', () => {
    const section = compactSection(
      parseSections(['[Intro]', 'Em  G  D  A7sus4', 'Em  G  D  A7sus4'].join('\n'))[0]
    );
    const rendered = renderFull(section);
    expect(rendered.renderLines).toHaveLength(1);
    expect(rendered.renderLines[0].text).toBe('Intro - Em G D A7sus4');
    expect(rendered.renderLines[0].kind).toBe('chord');
  });

  it('renders a lyric section as a heading line plus its body', () => {
    const section = compactSection(
      parseSections(['[Verse 1]', 'G  C', 'hello there'].join('\n'))[0]
    );
    const rendered = renderFull(section);
    expect(rendered.renderLines.map((l) => l.kind)).toEqual(['section', 'chord', 'lyric']);
    expect(rendered.renderLines[0].text).toBe('Verse 1');
  });

  it('compresses a section to a one-liner of its first chord progression', () => {
    const section = compactSection(
      parseSections(['[Chorus]', 'C  Em  G  D', 'a lyric line', 'another line'].join('\n'))[0]
    );
    const rendered = renderCompressed(section);
    expect(rendered.compressed).toBe(true);
    expect(rendered.renderLines).toHaveLength(1);
    expect(rendered.renderLines[0].text).toBe('Chorus - C Em G D');
  });
});

describe('packColumns', () => {
  const sec = (id, lineCount) => ({ id, renderLines: [], compressed: false, lineCount });

  it('fills column 1, then column 2, then overflow — never splitting a section', () => {
    const layout = packColumns([sec('a', 3), sec('b', 3), sec('c', 3)], 6);
    expect(layout.col1.map((s) => s.id)).toEqual(['a']);
    expect(layout.col2.map((s) => s.id)).toEqual(['b']);
    expect(layout.overflow.map((s) => s.id)).toEqual(['c']);
  });

  it('places every section exactly once (no duplication, no loss)', () => {
    const input = [sec('a', 2), sec('b', 5), sec('c', 4), sec('d', 1)];
    const layout = packColumns(input, 6);
    const placed = [...layout.col1, ...layout.col2, ...layout.overflow].map((s) => s.id);
    expect(placed.sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it('gives a section larger than the budget its own column rather than splitting it', () => {
    const layout = packColumns([sec('big', 100)], 6);
    expect(layout.col1.map((s) => s.id)).toEqual(['big']);
    expect(layout.fits).toBe(true);
  });
});

describe('buildLayout — adaptive compression', () => {
  const chart = [
    '[Verse 1]',
    'C  G',
    'line one here',
    'line two here',
    '[Chorus]',
    'G  D  Em',
    'chorus line a',
    'chorus line b',
    '[Verse 2]',
    'C  G',
    'line three here',
    'line four here',
    '[Chorus]',
    'G  D  Em',
    'chorus line a',
    'chorus line b',
  ].join('\n');

  it('keeps full detail when there is room (nothing compressed)', () => {
    const layout = buildLayout(chart, { columnLineBudget: 100 });
    const all = [...layout.col1, ...layout.col2, ...layout.overflow];
    expect(layout.fits).toBe(true);
    expect(all.some((s) => s.compressed)).toBe(false);
  });

  it('compresses the repeated section when it must shrink', () => {
    const layout = buildLayout(chart, { columnLineBudget: 5 });
    const all = [...layout.col1, ...layout.col2, ...layout.overflow];
    const compressed = all.filter((s) => s.compressed);
    // Only the repeat (the 2nd Chorus) compresses; the first occurrence stays full.
    expect(compressed.length).toBe(1);
    expect(compressed[0].renderLines[0].text).toBe('Chorus - G D Em');
  });

  it('returns an empty layout for empty input', () => {
    expect(buildLayout('', { columnLineBudget: 40 })).toEqual({
      col1: [],
      col2: [],
      overflow: [],
      fits: true,
    });
  });
});
