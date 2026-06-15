import { jest } from '@jest/globals';
import { isChallengePage, launchArgs, fetchViaUnlocker, loadChartPage } from '../src/fetcher.js';

const CHART_HTML = '<html><head><title>Open Shut Them Chords</title></head><body><pre>[Intro]</pre></body></html>';

// A fake Puppeteer page that records calls without a real browser. Methods are
// plain (non-async) — the code under test awaits them, and `await` on a
// non-promise is a no-op, so this keeps the mock simple and lint-clean.
function makeFakePage({ title = 'Open Shut Them Chords' } = {}) {
  const calls = { setContent: [], goto: [], authenticate: [], waitForSelector: 0, waitForFunction: 0 };
  return {
    _calls: calls,
    setDefaultNavigationTimeout: () => undefined,
    setDefaultTimeout: () => undefined,
    setViewport: () => undefined,
    setContent: (html, opts) => calls.setContent.push([html, opts]),
    goto: (url, opts) => calls.goto.push([url, opts]),
    authenticate: (creds) => calls.authenticate.push(creds),
    // These are awaited with a `.catch(...)` in fetcher.js, so return a thenable.
    waitForSelector: () => {
      calls.waitForSelector += 1;
      return Promise.resolve();
    },
    waitForFunction: () => {
      calls.waitForFunction += 1;
      return Promise.resolve();
    },
    title: () => title,
  };
}
const makeFakeBrowser = (page) => ({ newPage: () => page });

// A minimal fetch Response stand-in.
const fakeResponse = ({ ok = true, status = 200, statusText = 'OK', contentType = 'application/json', body } = {}) => ({
  ok,
  status,
  statusText,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
  json: () => body,
  text: () => body,
});

describe('isChallengePage', () => {
  it('flags Cloudflare-style interstitials', () => {
    for (const t of ['Just a moment...', 'Attention Required! | Cloudflare', 'Checking your browser']) {
      expect(isChallengePage(t)).toBe(true);
    }
  });
  it('passes a real chart title and empty input', () => {
    expect(isChallengePage('Open Shut Them Chords by Misc Children')).toBe(false);
    expect(isChallengePage('')).toBe(false);
  });
});

describe('launchArgs', () => {
  it('adds nothing for direct/unlocker', () => {
    expect(launchArgs('direct')).toEqual([]);
    expect(launchArgs('unlocker')).toEqual([]);
  });
  it('adds nothing for proxy when no PROXY_SERVER is configured (off by default)', () => {
    expect(launchArgs('proxy')).toEqual([]);
  });
});

describe('loadChartPage — strategy wiring (no env)', () => {
  it('direct: navigates to the URL and never uses setContent', async () => {
    const page = makeFakePage();
    await loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'direct');
    expect(page._calls.goto).toHaveLength(1);
    expect(page._calls.goto[0][0]).toBe('https://ug/x');
    expect(page._calls.setContent).toHaveLength(0);
    expect(page._calls.waitForSelector).toBe(1);
  });

  it('proxy: navigates and waits out the challenge interstitial', async () => {
    const page = makeFakePage();
    await loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'proxy');
    expect(page._calls.goto).toHaveLength(1);
    expect(page._calls.waitForFunction).toBe(1); // the challenge-clear wait
  });
});

describe('fetchViaUnlocker', () => {
  it('throws a clear error when UNLOCKER_API_URL is unset', async () => {
    await expect(fetchViaUnlocker('https://ug/x')).rejects.toThrow(/UNLOCKER_API_URL is not set/);
  });
});

describe('unlocker path (env-configured)', () => {
  const OLD_ENV = process.env;
  let mod = null;

  beforeEach(async () => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      FETCH_STRATEGY: 'unlocker',
      UNLOCKER_API_URL: 'https://unlock.example/api',
      UNLOCKER_API_KEY: 'secret',
      PROXY_SERVER: 'http://gw.example:7000',
      PROXY_USERNAME: 'user',
      PROXY_PASSWORD: 'pass',
    };
    mod = await import('../src/fetcher.js');
  });
  afterEach(() => {
    process.env = OLD_ENV;
    delete globalThis.fetch;
  });

  it('fetchViaUnlocker returns HTML from a JSON envelope', async () => {
    globalThis.fetch = () => fakeResponse({ contentType: 'application/json', body: { content: CHART_HTML } });
    expect(await mod.fetchViaUnlocker('https://ug/x')).toBe(CHART_HTML);
  });

  it('fetchViaUnlocker returns a raw-HTML body', async () => {
    globalThis.fetch = () => fakeResponse({ contentType: 'text/html', body: CHART_HTML });
    expect(await mod.fetchViaUnlocker('https://ug/x')).toBe(CHART_HTML);
  });

  it('fetchViaUnlocker throws on a non-OK response', async () => {
    globalThis.fetch = () => fakeResponse({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await expect(mod.fetchViaUnlocker('https://ug/x')).rejects.toThrow(/429/);
  });

  it('loadChartPage(unlocker) loads the fetched HTML via setContent, not goto', async () => {
    globalThis.fetch = () => fakeResponse({ contentType: 'application/json', body: { html: CHART_HTML } });
    const page = makeFakePage();
    await mod.loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'unlocker');
    expect(page._calls.setContent).toHaveLength(1);
    expect(page._calls.setContent[0][0]).toBe(CHART_HTML);
    expect(page._calls.goto).toHaveLength(0);
  });

  it('launchArgs(proxy) includes the proxy server when configured', () => {
    expect(mod.launchArgs('proxy')).toEqual(['--proxy-server=http://gw.example:7000']);
  });

  it('loadChartPage(proxy) authenticates when credentials are set', async () => {
    const page = makeFakePage();
    await mod.loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'proxy');
    expect(page._calls.authenticate).toEqual([{ username: 'user', password: 'pass' }]);
  });
});
