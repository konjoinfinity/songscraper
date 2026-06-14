// Headless Puppeteer scrape of an Ultimate Guitar chord chart.
// Pure function of the URL: opens a browser, reads the chart, closes the browser
// deterministically (try/finally), and returns the raw scraped fields.

import puppeteer from 'puppeteer';
import { config, selectors } from './config.js';

// Read every match of `selector` and return the concatenated textContent.
async function readJoined(page, selector) {
  const parts = await page.$$eval(selector, (els) => els.map((el) => el.textContent));
  return parts.join('');
}

/**
 * Scrape a song from an Ultimate Guitar URL.
 * @param {string} url - a validated ultimate-guitar.com chord chart URL
 * @returns {Promise<{ title: string, artist: string, rawText: string }>}
 */
export async function scrapeSong(url) {
  let browser;
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

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    // Wait for the chart to render instead of guessing with a timer.
    await page.waitForSelector(selectors.ready);

    const rawText = await readJoined(page, selectors.chordBlock);
    const rawTitle = await readJoined(page, selectors.title);
    const rawArtist = await readJoined(page, selectors.artist);

    // Legacy cleaning: strip " Chords" from the title and "Edit" from the artist.
    const title = rawTitle.replace(' Chords', '');
    const artist = rawArtist.replace('Edit', '');

    if (!rawText) {
      throw new Error(
        'Scrape returned an empty chord block — the Ultimate Guitar selectors may have changed. ' +
          'Re-pin them in src/config.js (selectors).'
      );
    }

    return { title, artist, rawText };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// The document title the legacy code produced: `${title}- ${artist}` (note: no
// space before the dash). Preserved exactly because it feeds the title placeholder.
export function buildDocTitle(title, artist) {
  return `${title}- ${artist}`;
}
