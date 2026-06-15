// Env-driven configuration. Everything that might change between environments
// (or that should never be hardcoded) lives here.

const {
  PORT,
  API_KEY,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  REFRESH_TOKEN,
  TEMPLATE_DOC_ID,
  DRIVE_FOLDER_ID,
  PUPPETEER_EXECUTABLE_PATH,
  SCRAPE_STRATEGY,
  DETECT_MIN_SCORE,
  FETCH_STRATEGY,
  PROXY_SERVER,
  PROXY_USERNAME,
  PROXY_PASSWORD,
  UNLOCKER_API_URL,
  UNLOCKER_API_KEY,
} = process.env;

export const config = {
  port: Number(PORT) || 8080,
  apiKey: API_KEY || '',

  oauth: {
    clientId: GOOGLE_CLIENT_ID || '',
    clientSecret: GOOGLE_CLIENT_SECRET || '',
    redirectUri: OAUTH_REDIRECT_URI || '',
    refreshToken: REFRESH_TOKEN || '',
  },

  // Kept identical to the legacy SCOPES (drive.metadata.readonly, documents, drive, drive.file).
  scopes: [
    'https://www.googleapis.com/auth/drive.metadata.readonly',
    'https://www.googleapis.com/auth/documents',
    'https://www.googleapis.com/auth/drive',
    'https://www.googleapis.com/auth/drive.file',
  ],

  // The Google Docs template copied for each new song. Was hardcoded in the legacy
  // pageScraper.js; now overridable via env.
  templateDocId: TEMPLATE_DOC_ID || '1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4',
  driveFolderId: DRIVE_FOLDER_ID || '',

  puppeteer: {
    headless: true,
    // Container-safe flags. --no-sandbox is required to run Chromium as root in a container.
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    executablePath: PUPPETEER_EXECUTABLE_PATH || undefined,
  },

  // How long to wait for navigation/selectors before giving up (ms).
  scrapeTimeoutMs: 45_000,

  // Extraction strategy: 'heuristic' (default, content-based, resilient to DOM
  // changes), 'auto' (selector first, heuristic fallback), or 'selector' (legacy).
  scrapeStrategy: SCRAPE_STRATEGY || 'heuristic',
  // Minimum chord-chart score the heuristic must clear to be trusted.
  detectMinScore: Number(DETECT_MIN_SCORE) || 5,

  // How the chart page is *fetched* (orthogonal to how the chart text is then
  // extracted, which is scrapeStrategy above):
  //   direct (default) — Puppeteer navigates UG itself (today's behavior).
  //   proxy            — Puppeteer navigates through a residential/mobile proxy.
  //   unlocker         — a scraping/"web unlocker" API returns rendered HTML,
  //                      which we load into the page (it solves Cloudflare + TLS
  //                      fingerprint + proxies internally).
  // Default is `direct` so local dev is unchanged. UG sits behind Cloudflare bot
  // protection that blocks headless Chrome from any IP (datacenter *and*
  // residential), so the deployed service on Cloud Run needs `proxy`/`unlocker`.
  fetchStrategy: FETCH_STRATEGY || 'direct',
  // Residential/mobile proxy for FETCH_STRATEGY=proxy. `server` is the launch
  // arg value, e.g. "http://gw.example.com:7000". Creds are sent via page auth.
  proxy: {
    server: PROXY_SERVER || '',
    username: PROXY_USERNAME || '',
    password: PROXY_PASSWORD || '',
  },
  // Web-unlocker / scraping API for FETCH_STRATEGY=unlocker. The exact request
  // shape varies by provider — see src/fetcher.js (fetchViaUnlocker) for the one
  // integration point to adapt.
  unlocker: {
    apiUrl: UNLOCKER_API_URL || '',
    apiKey: UNLOCKER_API_KEY || '',
  },
};

// Ultimate Guitar DOM selectors. These rot whenever UG ships a markup change.
// LAST VERIFIED: 2026-06-14 against a live page (npm run validate). UG's class
// names are build-hashed (e.g. `.QsmqP`, `.c4glK`) and churn on every deploy, so
// these are pinned to stable structure/semantics (tag, href) rather than classes.
// Centralized here precisely so re-pinning is a one-line edit.
export const selectors = {
  // A selector that signals the chart has rendered; we wait on it before reading.
  // The chart lives in a <pre>, which is the same element we read — a reliable
  // render signal that doesn't depend on a hashed class name.
  ready: 'pre',
  // The <pre> block(s) holding the chord chart text.
  chordBlock: 'pre',
  // The song title (an <h1> ending in " Chords"; the legacy " Chords" strip in
  // scraper.js still applies).
  title: 'h1',
  // The artist link, pinned by its /artist/ href (stable across UG markup
  // changes). The page repeats this link; scraper.js reads the first match.
  artist: 'a[href*="/artist/"]',
};

/**
 * Fail fast with a clear message when a required env value is missing.
 * @param {string[]} keys - logical config keys to require (e.g. 'apiKey', 'refreshToken')
 * @throws {Error} if any required value is unset
 * @returns {void}
 */
export function assertConfig(keys) {
  const missing = [];
  for (const key of keys) {
    if (key === 'apiKey' && !config.apiKey) missing.push('API_KEY');
    if (key === 'clientId' && !config.oauth.clientId) missing.push('GOOGLE_CLIENT_ID');
    if (key === 'clientSecret' && !config.oauth.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
    if (key === 'redirectUri' && !config.oauth.redirectUri) missing.push('OAUTH_REDIRECT_URI');
    if (key === 'refreshToken' && !config.oauth.refreshToken) missing.push('REFRESH_TOKEN');
  }
  if (missing.length > 0) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
  }
}
