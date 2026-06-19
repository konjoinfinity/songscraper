import { jest } from '@jest/globals';
import { isValidUgUrl } from '../src/server.js';

describe('isValidUgUrl', () => {
  it('accepts ultimate-guitar.com and its subdomains over http(s)', () => {
    expect(isValidUgUrl('https://tabs.ultimate-guitar.com/tab/x-chords-1')).toBe(true);
    expect(isValidUgUrl('https://ultimate-guitar.com/tab/x')).toBe(true);
    expect(isValidUgUrl('http://ultimate-guitar.com/x')).toBe(true);
  });

  it('rejects other hosts, schemes, and non-strings', () => {
    expect(isValidUgUrl('https://evil.com/x')).toBe(false);
    expect(isValidUgUrl('https://ultimate-guitar.com.evil.com/x')).toBe(false);
    expect(isValidUgUrl('ftp://ultimate-guitar.com/x')).toBe(false);
    expect(isValidUgUrl('javascript:alert(1)')).toBe(false);
    expect(isValidUgUrl('not a url')).toBe(false);
    expect(isValidUgUrl(42)).toBe(false);
  });

  it('is not fooled by userinfo@ host spoofing', () => {
    // The credential before @ is not the host; the real host is what matters.
    expect(isValidUgUrl('https://ultimate-guitar.com@evil.com/x')).toBe(false);
    expect(isValidUgUrl('https://evil.com@ultimate-guitar.com/x')).toBe(true);
  });
});

describe('apiKeyOk', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...OLD_ENV, API_KEY: 'secret-key-123' };
  });

  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('accepts the exact configured key and rejects everything else', async () => {
    const { apiKeyOk } = await import('../src/server.js');
    expect(apiKeyOk('secret-key-123')).toBe(true);
    expect(apiKeyOk('secret-key-124')).toBe(false); // same length, wrong value
    expect(apiKeyOk('wrong')).toBe(false); // different length
    expect(apiKeyOk(123)).toBe(false); // non-string
    expect(apiKeyOk(null)).toBe(false);
  });

  it('fails closed when API_KEY is unset', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV };
    delete process.env.API_KEY;
    const { apiKeyOk } = await import('../src/server.js');
    expect(apiKeyOk('anything')).toBe(false);
  });
});
