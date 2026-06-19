import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildLayout } from '../src/layout.js';
import { config } from '../src/config.js';

// Real Ultimate Guitar charts (captured to test/fixtures/charts/) exercised end to
// end through the layout pipeline. These guard against regressions on real-world
// variety: capo + repeats (riptide), an intro tab (wish_you_were_here), a long
// multi-page song (american_pie), fingerstyle (hey_there_delilah), and a simple
// repetitive one (country_roads).
const chartsDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'charts');
const charts = readdirSync(chartsDir)
  .filter((file) => file.endsWith('.json'))
  .map((file) => JSON.parse(readFileSync(join(chartsDir, file), 'utf8')));

// Page chrome / boilerplate that must never reach the rendered document.
const JUNK =
  /youtube\.com|youtu\.be|welcome offer|strumming pattern|create correction|report bad tab|please,?\s*rate|last update:|ukulele chords|was this info helpful/i;

const renderedLines = (layout) =>
  [...layout.col1, ...layout.col2, ...layout.overflow].flatMap((sec) =>
    sec.renderLines.map((line) => line.text)
  );

describe('real chart layout robustness', () => {
  it('ships at least 5 real chart fixtures', () => {
    expect(charts.length).toBeGreaterThanOrEqual(5);
  });

  for (const chart of charts) {
    describe(chart.name, () => {
      const layout = buildLayout(chart.rawText, config.format);
      const sections = [...layout.col1, ...layout.col2, ...layout.overflow];
      const lines = renderedLines(layout);

      it('parses into multiple sections with content in column 1', () => {
        expect(sections.length).toBeGreaterThanOrEqual(3);
        expect(layout.col1.length).toBeGreaterThan(0);
      });

      it('drops all trailing UG chrome / boilerplate', () => {
        const junk = lines.filter((line) => JUNK.test(line));
        expect(junk).toEqual([]);
      });

      it('places every section exactly once (no duplication, no loss)', () => {
        expect(new Set(sections).size).toBe(sections.length);
        expect(sections.length).toBe(
          layout.col1.length + layout.col2.length + layout.overflow.length
        );
      });

      it('renders no empty lines as section/chord (only real text is bold-eligible)', () => {
        const blankBold = sections
          .flatMap((sec) => sec.renderLines)
          .filter((line) => line.kind !== 'lyric' && line.text.trim() === '');
        expect(blankBold).toEqual([]);
      });
    });
  }
});

describe('chart intros collapse to a single dashed line', () => {
  const expectedIntro = {
    riptide: 'Intro - Em Dadd9 G',
    country_roads: 'Intro - A A A A',
    hey_there_delilah: 'Intro - D F#m D F#m',
  };
  for (const [name, intro] of Object.entries(expectedIntro)) {
    it(`${name}: ${intro}`, () => {
      const chart = charts.find((entry) => entry.name === name);
      expect(chart).toBeDefined();
      const layout = buildLayout(chart.rawText, config.format);
      expect(layout.col1[0].renderLines[0].text).toBe(intro);
    });
  }
});
