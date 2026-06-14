// Express HTTP wrapper. Routes:
//   GET  /healthz        -> liveness probe
//   GET  /auth           -> one-time OAuth consent (bootstrap)
//   GET  /oauth2callback -> capture the refresh token (bootstrap)
//   POST /scrape         -> scrape a UG chart and create a formatted Google Doc
//
// /scrape is guarded by the x-api-key shared secret and accepts only
// ultimate-guitar.com URLs.

import { timingSafeEqual } from 'node:crypto';
import express from 'express';
import { config } from './config.js';
import { scrapeSong } from './scraper.js';
import { getAuthorizedClient, handleAuth, handleOAuthCallback } from './google/auth.js';
import { createSongDoc } from './google/docs.js';

export const app = express();
app.use(express.json({ limit: '16kb' }));

/**
 * Constant-time API-key check. Rejects when API_KEY is unset (fail closed).
 * @param {unknown} provided - the value of the incoming x-api-key header
 * @returns {boolean} true only if it matches the configured API_KEY
 */
function apiKeyOk(provided) {
  if (!config.apiKey || typeof provided !== 'string') return false;
  const providedBuf = Buffer.from(provided);
  const expectedBuf = Buffer.from(config.apiKey);
  if (providedBuf.length !== expectedBuf.length) return false;
  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Express middleware enforcing the x-api-key shared secret on a route.
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 * @returns {void}
 */
function requireApiKey(req, res, next) {
  if (!apiKeyOk(req.get('x-api-key'))) {
    res.status(401).json({ error: 'Missing or invalid x-api-key' });
    return;
  }
  next();
}

/**
 * Parse a string into a URL, returning null instead of throwing.
 * @param {string} value - the candidate URL string
 * @returns {URL|null} the parsed URL, or null if invalid
 */
function parseUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

/**
 * Accept only well-formed http(s) ultimate-guitar.com URLs.
 * @param {unknown} value - the candidate URL
 * @returns {boolean} true if it is a valid ultimate-guitar.com URL
 */
export function isValidUgUrl(value) {
  if (typeof value !== 'string') return false;
  const url = parseUrl(value);
  if (!url) return false;
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'ultimate-guitar.com' || host.endsWith('.ultimate-guitar.com');
}

app.get('/healthz', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/auth', handleAuth);
app.get('/oauth2callback', handleOAuthCallback);

app.post('/scrape', requireApiKey, async (req, res) => {
  const { url } = req.body ?? {};
  if (!isValidUgUrl(url)) {
    res.status(400).json({ error: 'Body must include a valid ultimate-guitar.com `url`' });
    return;
  }

  try {
    const song = await scrapeSong(url);
    const authClient = getAuthorizedClient();
    const result = await createSongDoc(authClient, song);
    res.status(200).json({ docUrl: result.docUrl, title: result.title, artist: result.artist });
  } catch (err) {
    console.error('[scrape] failed:', err.message);
    res.status(500).json({ error: 'Scrape failed', detail: err.message });
  }
});

// Start the server unless imported (e.g. by tests).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  app.listen(config.port, () => {
    console.log(`songscraper listening on :${config.port}`);
  });
}
