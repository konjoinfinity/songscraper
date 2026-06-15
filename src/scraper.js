// Headless Puppeteer scrape of an Ultimate Guitar chord chart.
// Pure function of the URL: opens a browser, reads the chart, closes the browser
// deterministically (try/finally), and returns the raw scraped fields.

import puppeteer from 'puppeteer';
import { config, selectors } from './config.js';
import { detectChordBlock, parseTitleFromDocTitle } from './detect.js';

/**
 * Read every match of `selector` and return the concatenated textContent.
 * @param {import('puppeteer').Page} page - the Puppeteer page
 * @param {string} selector - a CSS selector
 * @returns {Promise<string>} the joined textContent of all matches
 */
async function readJoined(page, selector) {
  const parts = await page.$$eval(selector, (els) => els.map((el) => el.textContent));
  return parts.join('');
}

/**
 * Read the first match of `selector` and return its textContent ('' if none).
 * Used for single-valued fields (title, artist) where the selector may match
 * repeated links (e.g. the artist link appears several times on a UG page) and
 * joining every match would duplicate the value.
 * @param {import('puppeteer').Page} page - the Puppeteer page
 * @param {string} selector - a CSS selector
 * @returns {Promise<string>} the first match's textContent, or ''
 */
export async function readFirst(page, selector) {
  const parts = await page.$$eval(selector, (els) => els.map((el) => el.textContent));
  return parts[0] ?? '';
}

/**
 * Resolve the chord-chart text using the configured strategy.
 * @param {import('puppeteer').Page} page
 * @param {string} [strategy=config.scrapeStrategy]
 * @param {number} [minScore=config.detectMinScore]
 * @returns {Promise<string>} the raw chart text, or '' if all paths fail
 */
export async function extractChordText(
  page,
  strategy = config.scrapeStrategy,
  minScore = config.detectMinScore
) {
  /** @returns {Promise<string>} the selector-sourced chord text, trimmed */
  const viaSelector = async () => (await readJoined(page, selectors.chordBlock)).trim();
  /** @returns {Promise<string>} the heuristic-detected chord text, trimmed ('' if none) */
  const viaHeuristic = async () => ((await detectChordBlock(page, minScore)) ?? '').trim();

  if (strategy === 'selector') return viaSelector();
  if (strategy === 'auto') return (await viaSelector()) || viaHeuristic();
  // 'heuristic' (default)
  return (await viaHeuristic()) || viaSelector();
}

/**
 * Scrape a song from an Ultimate Guitar URL.
 * @param {string} url - a validated ultimate-guitar.com chord chart URL
 * @returns {Promise<{ title: string, artist: string, rawText: string }>}
 */
export async function scrapeSong(url) {
  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: config.puppeteer.headless,
      args: config.puppeteer.args,
      executablePath: config.puppeteer.executablePath,
    });

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(config.scrapeTimeoutMs);
    page.setDefaultTimeout(config.scrapeTimeoutMs);
    await page.setViewport({ width: 1350, height: 850 });

    await page.goto(url, { waitUntil: 'networkidle2' });
    // Best-effort: wait on the known render signal, but don't fail if it has rotted.
    await page.waitForSelector(selectors.ready).catch(() => null);

    const rawText = await extractChordText(page);
    const rawTitle = await readFirst(page, selectors.title);
    const rawArtist = await readFirst(page, selectors.artist);

    // Legacy cleaning: strip " Chords" from the title and "Edit" from the artist.
    let title = rawTitle.replace(' Chords', '');
    let artist = rawArtist.replace('Edit', '');
    if (!title || !artist) {
      const fromDoc = parseTitleFromDocTitle(await page.title());
      if (fromDoc) ({ title, artist } = fromDoc);
    }

    if (!rawText) {
      throw new Error(
        'Scrape returned an empty chord block — the heuristic found nothing above threshold and ' +
          'the Ultimate Guitar selectors may have changed. Re-pin them in src/config.js (selectors), ' +
          'lower DETECT_MIN_SCORE, or set SCRAPE_STRATEGY=selector/auto.'
      );
    }

    return { title, artist, rawText };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

/**
 * The document title the legacy code produced: `${title}- ${artist}` (note: no
 * space before the dash). Preserved exactly because it feeds the title placeholder.
 * @param {string} title - the song title
 * @param {string} artist - the artist name
 * @returns {string} the composed document title
 */
export function buildDocTitle(title, artist) {
  return `${title}- ${artist}`;
}
