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
};

// Ultimate Guitar DOM selectors. These rot whenever UG ships a markup change.
// LAST VERIFIED: 2024 (against the legacy code) — re-pin against a live page if a
// scrape returns empty fields. Centralized here precisely so re-pinning is a one-line edit.
export const selectors = {
  // A selector that signals the chart has rendered; we wait on it before reading.
  ready: '.P8ReX',
  // The <pre> block(s) holding the chord chart text.
  chordBlock: 'pre',
  // The song title (an <h1> ending in " Chords").
  title: 'header > div > h1',
  // The artist link.
  artist: 'header > div > span > a',
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
