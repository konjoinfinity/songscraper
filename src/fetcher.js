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

// A single long-lived browser process, reused across scrapes so the ~3.5s Chrome
// launch is paid once (at startup) rather than on every request. Each scrape gets
// a *fresh, isolated* BrowserContext (see openChart) — never a shared cookie jar:
// persisting Cloudflare cookies across visits provokes a hard challenge that never
// clears (measured: 75s timeout vs ~12s with fresh contexts). null when no browser
// is alive; relaunched lazily on next use.
let sharedBrowser = null;

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
  // `await` here (not a bare return) keeps this function genuinely async — it
  // resolves a session before returning — so the contract is uniform: every
  // branch settles a promise (string, resolved session, or rejection).
  if (browserbase.apiKey && browserbase.projectId) return await createBrowserbaseSession();
  throw new Error(
    'FETCH_STRATEGY=remote but no remote browser is configured. Set ' +
      'REMOTE_BROWSER_WS_ENDPOINT (e.g. a Browserless wss:// URL) or ' +
      'BROWSERBASE_API_KEY + BROWSERBASE_PROJECT_ID. See README.md / DEPLOY.md.'
  );
}

/**
 * Build the `puppeteer.launch` options for a fetch strategy. Pure (no I/O) so it
 * can be asserted in tests. `headless` follows config (real/headed only on the
 * self-hosted PUPPETEER_HEADLESS=false path); `args` adds the proxy server when
 * the proxy strategy is configured.
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {{ headless: boolean, args: string[], executablePath: (string|undefined) }}
 */
export function launchOptions(strategy = config.fetchStrategy) {
  return {
    headless: config.puppeteer.headless,
    args: [...config.puppeteer.args, ...launchArgs(strategy)],
    executablePath: config.puppeteer.executablePath,
  };
}

/**
 * Acquire a Puppeteer browser for the configured fetch strategy. For `remote`,
 * connect to a managed real browser; otherwise launch a local/container Chromium
 * (headless by default, or a real headed browser when PUPPETEER_HEADLESS=false on
 * a self-hosted residential host). The caller (scrapeSong) owns the lifecycle and
 * closes it deterministically — `browser.close()` works for both a launched and a
 * connected browser (and ends the remote session).
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function createBrowserSession(strategy = config.fetchStrategy) {
  if (strategy === 'remote') {
    const browserWSEndpoint = await resolveRemoteEndpoint();
    return puppeteer.connect({ browserWSEndpoint });
  }
  return puppeteer.launch(launchOptions(strategy));
}

/**
 * Return the shared, warm browser process, launching it on first use and after a
 * crash. Only for *local* launches (direct/proxy/unlocker) — the `remote` strategy
 * is per-scrape (managed sessions, esp. Browserbase) and is handled in openChart.
 * The `disconnected` listener drops the cached handle so the next call relaunches.
 * @param {() => Promise<import('puppeteer').Browser>} [launch] - injectable launcher (tests)
 * @returns {Promise<import('puppeteer').Browser>}
 */
export async function getBrowser(launch = () => puppeteer.launch(launchOptions())) {
  if (sharedBrowser?.connected) {
    return sharedBrowser;
  }
  sharedBrowser = await launch();
  sharedBrowser.once('disconnected', () => {
    sharedBrowser = null;
  });
  return sharedBrowser;
}

/**
 * Close and forget the shared browser. Call on shutdown; also a test seam.
 * @returns {Promise<void>}
 */
export async function closeSharedBrowser() {
  const browser = sharedBrowser;
  sharedBrowser = null;
  if (browser?.connected) {
    await browser.close().catch(() => null);
  }
}

/**
 * Acquire a loaded chart page plus a `release` to free its resources. For local
 * strategies this reuses the warm browser and isolates the scrape in a throwaway
 * BrowserContext (fresh cookies → no Cloudflare cross-visit penalty); release()
 * closes only that context, leaving the browser warm. For `remote`, a fresh
 * connection is made per scrape and release() closes it (ending the session).
 * @param {string} url - a validated ultimate-guitar.com chart URL
 * @param {string} [strategy=config.fetchStrategy]
 * @returns {Promise<{ page: import('puppeteer').Page, release: () => Promise<void> }>}
 */
export async function openChart(url, strategy = config.fetchStrategy) {
  if (strategy === 'remote') {
    const browser = await createBrowserSession(strategy);
    try {
      const page = await loadChartPage(browser, url, strategy);
      return { page, release: () => browser.close().catch(() => null) };
    } catch (err) {
      await browser.close().catch(() => null);
      throw err;
    }
  }

  const browser = await getBrowser();
  const context = await browser.createBrowserContext();
  try {
    const page = await loadChartPage(context, url, strategy);
    return { page, release: () => context.close().catch(() => null) };
  } catch (err) {
    await context.close().catch(() => null);
    throw err;
  }
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
 * @param {import('puppeteer').Browser|import('puppeteer').BrowserContext} browser - anything with newPage()
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

  // `domcontentloaded` (not `networkidle2`): UG is ad/tracker-heavy, so waiting
  // for the network to fall idle adds ~5s of pure waste — the chart <pre> and the
  // Cloudflare challenge both settle long before the ad sockets go quiet. We gate
  // explicitly below on the challenge-clear and the `pre` render signal instead,
  // which is both faster and a more honest readiness check. (Measured on a Pi 4:
  // ~21s networkidle2 nav vs ~12-15s domcontentloaded + these waits.)
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  // Wait out any Cloudflare interstitial before reading the chart. A real headed
  // browser (proxy/remote, or the self-hosted PUPPETEER_HEADLESS=false path on a
  // residential IP) solves the JS challenge within a few seconds; this resolves
  // immediately when there is no challenge, so it is harmless on a clean load.
  await waitForChallengeToClear(page);
  // Best-effort: wait on the known render signal, but don't fail if it has rotted.
  await page.waitForSelector(selectors.ready).catch(() => null);
  return page;
}
