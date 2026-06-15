// Page acquisition, decoupled from extraction. Ultimate Guitar sits behind
// Cloudflare bot protection that serves an interstitial ("Just a moment…") to
// headless Chrome from *any* IP — datacenter and residential alike — so the
// deployed service cannot simply navigate to the URL. `loadChartPage` funnels
// every fetch strategy down to a single Puppeteer `page` so the rest of the
// pipeline (extractChordText / detect.js / selectors / formatter) is reused
// unchanged regardless of how the HTML was obtained.
//
// Strategies (config.fetchStrategy):
//   direct   — navigate UG directly (today's behavior; the local-dev default).
//   proxy    — navigate through a residential/mobile proxy, then wait out the
//              Cloudflare interstitial if one appears.
//   unlocker — fetch rendered HTML from a web-unlocker API and load it into the
//              page via setContent (the API handles Cloudflare/TLS/proxy itself).
//   remote   — connect to a real browser running on a managed provider
//              (Browserless / Browserbase) with stealth + residential IPs, then
//              navigate normally (the provider's browser passes Cloudflare).
//
// Browser acquisition (launch locally vs. connect remotely) also lives here, in
// `createBrowserSession`, so scrapeSong stays agnostic to where the browser runs.

import puppeteer from 'puppeteer';
import { config, selectors } from './config.js';

// Markers of a Cloudflare (or similar) bot-check interstitial, matched against
// the page title and/or a snippet of the HTML. Kept deliberately broad.
const CHALLENGE_MARKERS = [
  /just a moment/i,
  /attention required/i,
  /checking your browser/i,
  /verify(?:ing)? you are human/i,
  /cf-browser-verification/i,
  /enable javascript and cookies to continue/i,
];

/**
 * Whether a page title (or HTML snippet) looks like an anti-bot challenge rather
 * than the real chart page.
 * @param {string} text - the document title and/or page HTML
 * @returns {boolean}
 */
export function isChallengePage(text) {
  if (!text) return false;
  return CHALLENGE_MARKERS.some((re) => re.test(text));
}

/**
 * Extra Chrome launch args for a fetch strategy. Only `proxy` needs any: the
 * proxy server must be set at browser launch (credentials are supplied per-page
 * via page.authenticate). `direct`/`unlocker` add nothing.
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {string[]}
 */
export function launchArgs(strategy = config.fetchStrategy) {
  if (strategy === 'proxy' && config.proxy.server) {
    return [`--proxy-server=${config.proxy.server}`];
  }
  return [];
}

/**
 * Fetch fully-rendered HTML for `url` from the configured web-unlocker API.
 *
 * THIS IS THE PER-PROVIDER INTEGRATION POINT. Providers differ (Bright Data,
 * Scrapfly, Zyte, ScrapingBee…); this sends a generic POST `{ url, render: true }`
 * with a Bearer key and accepts either a raw-HTML body or a JSON envelope with
 * the HTML under `content`/`html`/`body`/`data`. Adapt to your provider's API.
 * @param {string} url - the target Ultimate Guitar URL
 * @returns {Promise<string>} rendered HTML
 */
export async function fetchViaUnlocker(url) {
  const { apiUrl, apiKey } = config.unlocker;
  if (!apiUrl) {
    throw new Error('FETCH_STRATEGY=unlocker but UNLOCKER_API_URL is not set.');
  }
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ url, render: true }),
  });
  if (!res.ok) {
    throw new Error(`Unlocker request failed: ${res.status} ${res.statusText}`);
  }
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    const html = data.content ?? data.html ?? data.body ?? data.data;
    if (!html) {
      throw new Error(
        'Unlocker JSON response contained no HTML (expected content/html/body/data).'
      );
    }
    return html;
  }
  return res.text();
}

/**
 * Mint a Browserbase session and return its WebSocket `connectUrl`. Browserbase
 * has no static endpoint — each scrape gets a fresh session (closed when the
 * browser closes, which also stops proxy billing).
 *
 * THIS IS A PER-PROVIDER INTEGRATION POINT (like fetchViaUnlocker). The request
 * shape is Browserbase's; adapt it for a different session-based provider.
 * @returns {Promise<string>} the session's `connectUrl`
 */
export async function createBrowserbaseSession() {
  const { apiKey, projectId, apiUrl, region, proxies } = config.remote.browserbase;
  if (!apiKey || !projectId) {
    throw new Error('Browserbase requires BROWSERBASE_API_KEY and BROWSERBASE_PROJECT_ID.');
  }
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-bb-api-key': apiKey },
    body: JSON.stringify({ projectId, proxies, ...(region ? { region } : {}) }),
  });
  if (!res.ok) {
    throw new Error(`Browserbase session create failed: ${res.status} ${res.statusText}`);
  }
  const data = await res.json();
  if (!data.connectUrl) {
    throw new Error('Browserbase response contained no connectUrl.');
  }
  return data.connectUrl;
}

/**
 * Resolve the WebSocket endpoint to connect a remote browser to. Prefers an
 * explicit endpoint (Browserless and most providers); otherwise mints one from
 * Browserbase. Throws a clear, actionable error if nothing is configured.
 * @returns {Promise<string>} a `browserWSEndpoint` for puppeteer.connect
 */
export async function resolveRemoteEndpoint() {
  const { wsEndpoint, browserbase } = config.remote;
  if (wsEndpoint) return wsEndpoint;
  if (browserbase.apiKey && browserbase.projectId) return createBrowserbaseSession();
  throw new Error(
    'FETCH_STRATEGY=remote but no remote browser is configured. Set ' +
      'REMOTE_BROWSER_WS_ENDPOINT (e.g. a Browserless wss:// URL) or ' +
      'BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID. See README.md / DEPLOY.md.'
  );
}

/**
 * Acquire a Puppeteer browser for the configured fetch strategy. For `remote`,
 * connect to a managed real browser; otherwise launch a local/container Chromium
 * with the headless container-safe flags. The caller (scrapeSong) owns the
 * lifecycle and closes it deterministically — `browser.close()` works for both a
 * launched and a connected browser (and ends the remote session).
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function createBrowserSession(strategy = config.fetchStrategy) {
  if (strategy === 'remote') {
    const browserWSEndpoint = await resolveRemoteEndpoint();
    return puppeteer.connect({ browserWSEndpoint });
  }
  return puppeteer.launch({
    headless: config.puppeteer.headless,
    args: [...config.puppeteer.args, ...launchArgs(strategy)],
    executablePath: config.puppeteer.executablePath,
  });
}

/**
 * Wait (bounded, condition-based — no timers) for a Cloudflare interstitial to
 * resolve to the real page. Resolves as soon as the title no longer matches a
 * challenge marker; gives up quietly on timeout so the caller's challenge guard
 * can surface a clear error.
 * @param {import('puppeteer').Page} page
 * @returns {Promise<void>}
 */
async function waitForChallengeToClear(page) {
  await page
    .waitForFunction(
      (markers) => !markers.some((re) => new RegExp(re.source, re.flags).test(document.title)),
      { timeout: config.scrapeTimeoutMs },
      CHALLENGE_MARKERS.map((re) => ({ source: re.source, flags: re.flags }))
    )
    .catch(() => null);
}

/**
 * Open `url` and return a Puppeteer page holding the chart's DOM, using the
 * configured fetch strategy. The browser is owned by the caller (scrapeSong),
 * which closes it deterministically; this only creates and loads the page.
 * @param {import('puppeteer').Browser} browser
 * @param {string} url - a validated ultimate-guitar.com chart URL
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {Promise<import('puppeteer').Page>}
 */
export async function loadChartPage(browser, url, strategy = config.fetchStrategy) {
  const page = await browser.newPage();
  page.setDefaultNavigationTimeout(config.scrapeTimeoutMs);
  page.setDefaultTimeout(config.scrapeTimeoutMs);
  await page.setViewport({ width: 1350, height: 850 });

  if (strategy === 'unlocker') {
    const html = await fetchViaUnlocker(url);
    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    return page;
  }

  if (strategy === 'proxy' && config.proxy.username) {
    await page.authenticate({
      username: config.proxy.username,
      password: config.proxy.password,
    });
  }

  await page.goto(url, { waitUntil: 'networkidle2' });
  if (strategy === 'proxy' || strategy === 'remote') {
    // The provider's browser usually clears Cloudflare itself, but wait out any
    // residual interstitial before reading the chart.
    await waitForChallengeToClear(page);
  }
  // Best-effort: wait on the known render signal, but don't fail if it has rotted.
  await page.waitForSelector(selectors.ready).catch(() => null);
  return page;
}
