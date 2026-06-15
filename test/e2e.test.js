// Deterministic end-to-end tests over REAL Ultimate Guitar pages.
//
// Each fixture in test/fixtures/e2e/ is a trimmed snapshot of a live UG page
// (captured 2026-06-15; scripts/media stripped, structure + chart <pre> kept).
// We load it into headless Chrome via page.setContent — NO network, so this is
// immune to Cloudflare and fully reproducible — then run the exact extraction
// pipeline scrapeSong uses (extractChordText + the title/artist selector reads).
//
// Skips cleanly when the manifest or a Chromium binary is unavailable, so the
// default unit run never depends on a browser being present.

import { readFileSync, existsSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { config, selectors } from '../src/config.js';
import { extractChordText, readFirst } from '../src/scraper.js';

const fix = (name) => new URL(`./fixtures/e2e/${name}`, import.meta.url);

let manifest = [];
try {
  manifest = JSON.parse(readFileSync(fix('manifest.json'), 'utf8'));
} catch {
  manifest = [];
}

let chromePath = '';
try {
  // Puppeteer 25's executablePath() resolves asynchronously.
  chromePath = await puppeteer.executablePath();
} catch {
  chromePath = '';
}

const canRun = manifest.length > 0 && chromePath && existsSync(chromePath);
const describeE2E = canRun ? describe : describe.skip;

describeE2E('E2E — real UG fixtures through the extraction pipeline', () => {
  let browser = null;
  let warn = null;
  beforeAll(async () => {
    // detect.js logs an informational warning on every match; silence it here.
    warn = console.warn;
    console.warn = () => undefined;
    browser = await puppeteer.launch({
      headless: true,
      args: config.puppeteer.args,
      executablePath: config.puppeteer.executablePath,
    });
  });
  afterAll(async () => {
    if (browser) await browser.close();
    console.warn = warn;
  });

  // test.each (one call, not a function declared in a loop) over the manifest.
  test.each(manifest)(
    '$slug',
    async (entry) => {
      const isGuitarPro = entry.slug.includes('guitar-pro');
      const html = readFileSync(fix(entry.file), 'utf8');
      const page = await browser.newPage();
      try {
        await page.setContent(html, { waitUntil: 'domcontentloaded' });

        // Title/artist resolve from the re-pinned selectors (CSS-independent
        // textContent reads), with the legacy cleaning applied.
        const title = (await readFirst(page, selectors.title)).replace(' Chords', '').trim();
        const artist = (await readFirst(page, selectors.artist)).replace('Edit', '').trim();
        expect(title).toBe(entry.expectTitle);
        expect(artist).toBe(entry.expectArtist);

        const selText = await extractChordText(page, 'selector', config.detectMinScore);

        if (isGuitarPro) {
          // A Guitar Pro tab has no chord <pre> — document that the chords
          // selector path yields nothing (the service should reject/redirect
          // these; they are not chord charts).
          expect(selText).toBe('');
          return;
        }

        // Selector path: the exact chord block, by length and a section marker.
        expect(selText.length).toBeGreaterThanOrEqual(entry.minLen);
        expect(selText).toContain(entry.marker);

        // Default heuristic path returns the chart too (must contain the same
        // section marker — this is the over-capture regression, live).
        const heurText = await extractChordText(page, 'heuristic', config.detectMinScore);
        expect(heurText).toContain(entry.marker);
      } finally {
        await page.close();
      }
    },
    30000
  );
});
