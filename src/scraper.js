// Headless Puppeteer scrape of an Ultimate Guitar chord chart.
// Pure function of the URL: opens a browser, reads the chart, closes the browser
// deterministically (try/finally), and returns the raw scraped fields.

import { config, selectors } from './config.js';
import { detectChordBlock, parseTitleFromDocTitle } from './detect.js';
import { openChart, isChallengePage } from './fetcher.js';

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
  // Acquire a loaded chart page plus its `release`. For local strategies this
  // reuses the warm browser process and isolates the scrape in a throwaway
  // BrowserContext; for `remote` it is a per-scrape connection. release() frees
  // the right resource (context or connection) — see fetcher.openChart.
  const { page, release } = await openChart(url);
  try {
    // Fail fast with a clear, actionable message if we got an anti-bot wall
    // instead of the chart (the unlocker path is expected to have solved it).
    if (config.fetchStrategy !== 'unlocker' && isChallengePage(await page.title())) {
      throw new Error(
        'Blocked by anti-bot protection (a Cloudflare-style challenge page was returned ' +
          `instead of the chart). FETCH_STRATEGY is "${config.fetchStrategy}". UG blocks ` +
          'headless Chrome from any IP; set FETCH_STRATEGY=remote (a managed real browser, ' +
          'recommended) or =unlocker, or =proxy with a residential/mobile proxy. ' +
          'See README.md / DEPLOY.md.'
      );
    }

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
    await release();
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
