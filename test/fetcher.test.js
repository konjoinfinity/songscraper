import { jest } from '@jest/globals';
import {
  isChallengePage,
  launchArgs,
  launchOptions,
  fetchViaUnlocker,
  loadChartPage,
  resolveRemoteEndpoint,
  getBrowser,
  openChart,
  closeSharedBrowser,
} from '../src/fetcher.js';

const CHART_HTML =
  '<html><head><title>Open Shut Them Chords</title></head><body><pre>[Intro]</pre></body></html>';

// A fake Puppeteer page that records calls without a real browser. Methods are
// plain (non-async) — the code under test awaits them, and `await` on a
// non-promise is a no-op, so this keeps the mock simple and lint-clean.
function makeFakePage({ title = 'Open Shut Them Chords' } = {}) {
  const calls = {
    setContent: [],
    goto: [],
    authenticate: [],
    waitForSelector: 0,
    waitForFunction: 0,
  };
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
const fakeResponse = ({
  ok = true,
  status = 200,
  statusText = 'OK',
  contentType = 'application/json',
  body,
} = {}) => ({
  ok,
  status,
  statusText,
  headers: { get: (k) => (k.toLowerCase() === 'content-type' ? contentType : null) },
  json: () => body,
  text: () => body,
});

describe('isChallengePage', () => {
  it('flags Cloudflare-style interstitials', () => {
    for (const t of [
      'Just a moment...',
      'Attention Required! | Cloudflare',
      'Checking your browser',
    ]) {
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

describe('launchOptions (no env)', () => {
  it('defaults to headless with the container-safe flags and no executablePath', () => {
    const opts = launchOptions('direct');
    expect(opts.headless).toBe(true);
    expect(opts.args).toEqual([
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ]);
    expect(opts.executablePath).toBeUndefined();
  });
});

describe('loadChartPage — strategy wiring (no env)', () => {
  it('direct: navigates, waits out any interstitial, and never uses setContent', async () => {
    const page = makeFakePage();
    await loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'direct');
    expect(page._calls.goto).toHaveLength(1);
    expect(page._calls.goto[0][0]).toBe('https://ug/x');
    expect(page._calls.setContent).toHaveLength(0);
    expect(page._calls.waitForSelector).toBe(1);
    expect(page._calls.waitForFunction).toBe(1); // the challenge-clear wait
  });

  it('proxy: navigates and waits out the challenge interstitial', async () => {
    const page = makeFakePage();
    await loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'proxy');
    expect(page._calls.goto).toHaveLength(1);
    expect(page._calls.waitForFunction).toBe(1); // the challenge-clear wait
  });
});

describe('getBrowser — warm reuse', () => {
  afterEach(async () => {
    await closeSharedBrowser();
  });

  it('launches once and reuses the same browser while connected', async () => {
    let launches = 0;
    const fake = { connected: true, once: () => undefined, close: () => Promise.resolve() };
    const launch = () => {
      launches += 1;
      return Promise.resolve(fake);
    };
    const first = await getBrowser(launch);
    const second = await getBrowser(launch);
    expect(first).toBe(fake);
    expect(second).toBe(fake);
    expect(launches).toBe(1);
  });

  it('relaunches when the cached browser is no longer connected', async () => {
    let launches = 0;
    const dead = { connected: false, once: () => undefined, close: () => Promise.resolve() };
    const live = { connected: true, once: () => undefined, close: () => Promise.resolve() };
    const launch = () => {
      launches += 1;
      return Promise.resolve(launches === 1 ? dead : live);
    };
    expect(await getBrowser(launch)).toBe(dead);
    expect(await getBrowser(launch)).toBe(live);
    expect(launches).toBe(2);
  });

  it('drops the handle when the disconnected event fires', async () => {
    let launches = 0;
    let onDisconnect = null;
    const first = {
      connected: true,
      once: (ev, fn) => {
        if (ev === 'disconnected') onDisconnect = fn;
      },
      close: () => Promise.resolve(),
    };
    const second = { connected: true, once: () => undefined, close: () => Promise.resolve() };
    const launch = () => {
      launches += 1;
      return Promise.resolve(launches === 1 ? first : second);
    };
    await getBrowser(launch);
    onDisconnect(); // simulate a crash
    expect(await getBrowser(launch)).toBe(second);
    expect(launches).toBe(2);
  });

  it('launches only once under concurrent cold-start calls', async () => {
    let launches = 0;
    let resolveLaunch = null;
    const fake = { connected: true, once: () => undefined, close: () => Promise.resolve() };
    const launch = () => {
      launches += 1;
      return new Promise((resolve) => {
        resolveLaunch = resolve;
      });
    };
    // Both calls happen before the launch resolves → they must share one launch.
    const first = getBrowser(launch);
    const second = getBrowser(launch);
    resolveLaunch(fake);
    expect(await first).toBe(fake);
    expect(await second).toBe(fake);
    expect(launches).toBe(1);
  });
});

describe('openChart — context lifecycle', () => {
  afterEach(async () => {
    await closeSharedBrowser();
  });

  it('local: opens a fresh context, and release() closes the context but not the browser', async () => {
    const page = makeFakePage();
    let contextClosed = 0;
    let browserClosed = 0;
    const context = {
      newPage: () => page,
      close: () => {
        contextClosed += 1;
        return Promise.resolve();
      },
    };
    const fakeBrowser = {
      connected: true,
      once: () => undefined,
      createBrowserContext: () => Promise.resolve(context),
      close: () => {
        browserClosed += 1;
        return Promise.resolve();
      },
    };
    await getBrowser(() => Promise.resolve(fakeBrowser)); // seed the warm browser
    const { page: got, release } = await openChart('https://ug/x', 'direct');
    expect(got).toBe(page);
    expect(page._calls.goto).toHaveLength(1);
    await release();
    expect(contextClosed).toBe(1);
    expect(browserClosed).toBe(0); // browser stays warm across scrapes
  });

  it('remote: surfaces a clear error when no remote browser is configured', async () => {
    await expect(openChart('https://ug/x', 'remote')).rejects.toThrow(
      /no remote browser is configured/
    );
  });
});

describe('fetchViaUnlocker', () => {
  it('throws a clear error when UNLOCKER_API_URL is unset', async () => {
    await expect(fetchViaUnlocker('https://ug/x')).rejects.toThrow(/UNLOCKER_API_URL is not set/);
  });
});

describe('resolveRemoteEndpoint (no env)', () => {
  it('throws a clear, actionable error when no remote browser is configured', async () => {
    await expect(resolveRemoteEndpoint()).rejects.toThrow(/no remote browser is configured/);
  });
});

describe('remote: navigation still waits out the Cloudflare interstitial', () => {
  it('loadChartPage(remote) navigates and runs the challenge-clear wait', async () => {
    const page = makeFakePage();
    await loadChartPage(makeFakeBrowser(page), 'https://ug/x', 'remote');
    expect(page._calls.goto).toHaveLength(1);
    expect(page._calls.goto[0][0]).toBe('https://ug/x');
    expect(page._calls.setContent).toHaveLength(0);
    expect(page._calls.waitForFunction).toBe(1); // the challenge-clear wait
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
    globalThis.fetch = () =>
      fakeResponse({ contentType: 'application/json', body: { content: CHART_HTML } });
    expect(await mod.fetchViaUnlocker('https://ug/x')).toBe(CHART_HTML);
  });

  it('fetchViaUnlocker returns a raw-HTML body', async () => {
    globalThis.fetch = () => fakeResponse({ contentType: 'text/html', body: CHART_HTML });
    expect(await mod.fetchViaUnlocker('https://ug/x')).toBe(CHART_HTML);
  });

  it('fetchViaUnlocker throws on a non-OK response', async () => {
    globalThis.fetch = () =>
      fakeResponse({ ok: false, status: 429, statusText: 'Too Many Requests' });
    await expect(mod.fetchViaUnlocker('https://ug/x')).rejects.toThrow(/429/);
  });

  it('loadChartPage(unlocker) loads the fetched HTML via setContent, not goto', async () => {
    globalThis.fetch = () =>
      fakeResponse({ contentType: 'application/json', body: { html: CHART_HTML } });
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

describe('launchOptions — self-hosted headed browser (env-configured)', () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = OLD_ENV;
  });

  it('launches a real (headed) browser when PUPPETEER_HEADLESS=false', async () => {
    jest.resetModules();
    process.env = {
      ...OLD_ENV,
      PUPPETEER_HEADLESS: 'false',
      PUPPETEER_EXECUTABLE_PATH: '/usr/bin/chromium',
    };
    const mod = await import('../src/fetcher.js');
    const opts = mod.launchOptions('direct');
    expect(opts.headless).toBe(false);
    expect(opts.executablePath).toBe('/usr/bin/chromium');
    expect(opts.args).toContain('--no-sandbox');
  });

  it('stays headless for any value other than the literal "false"', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV, PUPPETEER_HEADLESS: 'true' };
    const mod = await import('../src/fetcher.js');
    expect(mod.launchOptions('direct').headless).toBe(true);
  });
});

describe('remote endpoint resolution (env-configured)', () => {
  const OLD_ENV = process.env;
  afterEach(() => {
    process.env = OLD_ENV;
    delete globalThis.fetch;
  });

  it('prefers an explicit REMOTE_BROWSER_WS_ENDPOINT (e.g. Browserless)', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV, REMOTE_BROWSER_WS_ENDPOINT: 'wss://chrome.example?token=abc' };
    const mod = await import('../src/fetcher.js');
    expect(await mod.resolveRemoteEndpoint()).toBe('wss://chrome.example?token=abc');
  });

  it('mints a Browserbase session and returns its connectUrl', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV, BROWSERBASE_API_KEY: 'bb-key', BROWSERBASE_PROJECT_ID: 'proj-1' };
    const mod = await import('../src/fetcher.js');
    globalThis.fetch = () =>
      fakeResponse({
        contentType: 'application/json',
        body: { connectUrl: 'wss://bb.example/session/1' },
      });
    expect(await mod.resolveRemoteEndpoint()).toBe('wss://bb.example/session/1');
  });

  it('throws when the Browserbase session response has no connectUrl', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV, BROWSERBASE_API_KEY: 'bb-key', BROWSERBASE_PROJECT_ID: 'proj-1' };
    const mod = await import('../src/fetcher.js');
    globalThis.fetch = () => fakeResponse({ contentType: 'application/json', body: {} });
    await expect(mod.createBrowserbaseSession()).rejects.toThrow(/no connectUrl/);
  });

  it('throws on a non-OK Browserbase response', async () => {
    jest.resetModules();
    process.env = { ...OLD_ENV, BROWSERBASE_API_KEY: 'bb-key', BROWSERBASE_PROJECT_ID: 'proj-1' };
    const mod = await import('../src/fetcher.js');
    globalThis.fetch = () => fakeResponse({ ok: false, status: 401, statusText: 'Unauthorized' });
    await expect(mod.createBrowserbaseSession()).rejects.toThrow(/401/);
  });
});
