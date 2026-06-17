import { jest } from '@jest/globals';

// getAuthorizedClient reads config (which reads process.env at import), so each
// case sets the required OAuth env, resets the module registry, and dynamically
// imports a fresh module. No network: constructing the OAuth2 client and setting
// the refresh token does not mint an access token (that happens on first API call).
describe('getAuthorizedClient — memoization', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      OAUTH_REDIRECT_URI: 'http://localhost/oauth2callback',
      REFRESH_TOKEN: 'refresh-token',
    };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('returns the same client instance across calls (token reuse)', async () => {
    const { getAuthorizedClient, resetAuthorizedClient } = await import('../src/google/auth.js');
    resetAuthorizedClient();
    const first = getAuthorizedClient();
    const second = getAuthorizedClient();
    expect(first).toBe(second);
  });

  it('rebuilds the client after resetAuthorizedClient (e.g. token rotation)', async () => {
    const { getAuthorizedClient, resetAuthorizedClient } = await import('../src/google/auth.js');
    resetAuthorizedClient();
    const first = getAuthorizedClient();
    resetAuthorizedClient();
    const second = getAuthorizedClient();
    expect(first).not.toBe(second);
  });
});
