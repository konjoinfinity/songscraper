// Headless OAuth: a manually-configured OAuth2 client built from env. Replaces
// @google-cloud/local-auth (which opened a desktop browser + localhost redirect).
//
// One-time bootstrap:
//   GET /auth           -> redirect to Google's consent screen
//   GET /oauth2callback -> exchange the code, capture the refresh_token
//
// Per request: setCredentials({ refresh_token }) and let googleapis auto-mint a
// fresh access token. No consent, no disk writes on the deployed path.

import { google } from 'googleapis';
import { config, assertConfig } from '../config.js';

// A bare OAuth2 client (no credentials set). Used for the consent flow.
function makeOAuthClient() {
  assertConfig(['clientId', 'clientSecret', 'redirectUri']);
  return new google.auth.OAuth2(
    config.oauth.clientId,
    config.oauth.clientSecret,
    config.oauth.redirectUri
  );
}

/**
 * An authorized client for normal runs: loads the stored refresh token and lets
 * googleapis auto-refresh the access token. Throws clearly if no token is set.
 * @returns {import('google-auth-library').OAuth2Client}
 */
export function getAuthorizedClient() {
  assertConfig(['clientId', 'clientSecret', 'refreshToken']);
  const client = new google.auth.OAuth2(
    config.oauth.clientId,
    config.oauth.clientSecret,
    config.oauth.redirectUri
  );
  client.setCredentials({ refresh_token: config.oauth.refreshToken });
  return client;
}

/**
 * GET /auth — redirect the user to Google's consent screen. `access_type:
 * 'offline'` + `prompt: 'consent'` reliably yields a refresh token.
 */
export function handleAuth(req, res) {
  try {
    const client = makeOAuthClient();
    const url = client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: config.scopes,
    });
    res.redirect(url);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

/**
 * GET /oauth2callback — exchange the code for tokens and surface the refresh
 * token. In a deployed environment this is where you would write the token to
 * Secret Manager; here we never persist it to disk — we return/log it so it can
 * be stored as a secret manually.
 */
export async function handleOAuthCallback(req, res) {
  const code = req.query.code;
  if (!code) {
    res.status(400).json({ error: 'Missing authorization code' });
    return;
  }
  try {
    const client = makeOAuthClient();
    const { tokens } = await client.getToken(code);
    const refreshToken = tokens.refresh_token;

    if (!refreshToken) {
      res.status(400).json({
        error:
          'No refresh token returned. Revoke the app at https://myaccount.google.com/permissions ' +
          'and retry /auth (prompt=consent + access_type=offline are required for a refresh token).',
      });
      return;
    }

    // Do NOT write token.json to disk on the deployed path. The operator stores
    // this value in Secret Manager / the REFRESH_TOKEN env var.
    console.log('[auth] Obtained refresh token (store it as the REFRESH_TOKEN secret).');
    res.status(200).json({
      message:
        'Authorization complete. Store this refresh_token as the REFRESH_TOKEN secret, then ' +
        'redeploy. Do not commit it.',
      refresh_token: refreshToken,
    });
  } catch (err) {
    res.status(500).json({ error: `Token exchange failed: ${err.message}` });
  }
}
