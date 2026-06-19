// Headless Puppeteer scrape of an Ultimate Guitar chord chart.
// Pure function of the URL: opens a browser, reads the chart, closes the browser
// deterministically (try/finally), and returns the raw scraped fields.

import { config, selectors } from './config.js';
import { detectChordBlock, parseTitleFromDocTitle } from './detect.js';
import { openChart, isChallengePage } from './fetcher.js';

/**
 * Read the textContent of every element matching `selector`.
 * @param {import('puppeteer').Page} page - the Puppeteer page
 * @param {string} selector - a CSS selector
 * @returns {Promise<string[]>} the textContent of each match
 */
async function readTexts(page, selector) {
  return page.$$eval(selector, (els) => els.map((el) => el.textContent));
}

/**
 * Read every match of `selector` and return the concatenated textContent.
 * @param {import('puppeteer').Page} page - the Puppeteer page
 * @param {string} selector - a CSS selector
 * @returns {Promise<string>} the joined textContent of all matches
 */
async function readJoined(page, selector) {
  return (await readTexts(page, selector)).join('');
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
  return (await readTexts(page, selector))[0] ?? '';
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
 * Whether a scrape error is worth one clean retry: a cold-start/transient empty
 * page, or an anti-bot challenge that a fresh context often clears.
 * @param {Error} error
 * @returns {boolean}
 */
export function isRetryableScrapeError(error) {
  return /empty chord block|anti-bot protection|net::err/i.test(error?.message ?? '');
}

/**
 * Scrape a song from an Ultimate Guitar URL. Retries once on a transient failure
 * (the first navigation after a cold start, or a one-off Cloudflare challenge,
 * occasionally returns an empty/challenge page; a clean second attempt with a
 * fresh browser context usually succeeds).
 * @param {string} url - a validated ultimate-guitar.com chord chart URL
 * @returns {Promise<{ title: string, artist: string, rawText: string }>}
 */
export async function scrapeSong(url) {
  try {
    return await attemptScrape(url);
  } catch (error) {
    if (!isRetryableScrapeError(error)) throw error;
    console.warn(
      `[scrape] first attempt failed (${error.message.split('—')[0].trim()}); retrying once.`
    );
    return await attemptScrape(url);
  }
}

/**
 * A single scrape attempt: acquire the chart page, guard against anti-bot walls,
 * and read the fields. The caller (scrapeSong) owns retry policy.
 * @param {string} url - a validated ultimate-guitar.com chord chart URL
 * @returns {Promise<{ title: string, artist: string, rawText: string }>}
 */
async function attemptScrape(url) {
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
