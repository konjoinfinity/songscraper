// Live-scrape diagnostic harness. Given a real Ultimate Guitar URL, it launches
// the production Puppeteer config and dumps everything needed to (a) confirm the
// heuristic detector picks the chord block and (b) re-pin the CSS selectors in
// src/config.js if they have rotted.
//
// Run: npm run validate -- "https://tabs.ultimate-guitar.com/tab/.../...-chords-..."
//
// This is a dev-only tool (scripts/ is excluded from analysis). The candidate
// collector is duplicated inline so shipped src/detect.js stays untouched.

import puppeteer from 'puppeteer';
import { config, selectors } from '../src/config.js';
import { scoreChordText, pickBestCandidate, parseTitleFromDocTitle } from '../src/detect.js';
import { extractChordText } from '../src/scraper.js';

const url = process.argv[2];
if (!url) {
  console.error('usage: npm run validate -- "<ultimate-guitar URL>"');
  process.exit(1);
}

// Mirror of src/detect.js collectCandidatesInPage (runs in the browser).
/* eslint-disable no-undef */
function collectCandidatesInPage() {
  const out = [];
  const seen = new Set();
  const consider = (el) => {
    const text = el.innerText || el.textContent || '';
    if (!text) return;
    if (text.length > 20000) return;
    if (text.split('\n').length < 4) return;
    if (seen.has(text)) return;
    seen.add(text);
    out.push({ tag: el.tagName.toLowerCase(), text });
  };
  document.querySelectorAll('pre').forEach(consider);
  document.querySelectorAll('div, section, article, td').forEach((el) => {
    if (el.childElementCount <= 3) consider(el);
  });
  return out;
}
/* eslint-enable no-undef */

const snippet = (s, n = 70) => JSON.stringify((s || '').replace(/\s+/g, ' ').trim().slice(0, n));

async function main() {
  const browser = await puppeteer.launch({
    headless: config.puppeteer.headless,
    args: config.puppeteer.args,
    executablePath: config.puppeteer.executablePath,
  });
  try {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(config.scrapeTimeoutMs);
    page.setDefaultTimeout(config.scrapeTimeoutMs);
    await page.setViewport({ width: 1350, height: 850 });

    console.log(`\nNavigating to ${url} ...`);
    await page.goto(url, { waitUntil: 'networkidle2' });
    await page
      .waitForSelector(selectors.ready, { timeout: 8000 })
      .then(() => console.log(`ready selector "${selectors.ready}" present ✓`))
      .catch(() => console.log(`ready selector "${selectors.ready}" NOT found ✗`));

    const docTitle = await page.title();
    console.log('\n== document.title ==');
    console.log(' ', JSON.stringify(docTitle));
    console.log('  parseTitleFromDocTitle ->', parseTitleFromDocTitle(docTitle));

    console.log('\n== configured selectors ==');
    for (const [name, sel] of Object.entries(selectors)) {
      const matches = await page
        .$$eval(sel, (els) => els.map((e) => (e.textContent || '').trim()))
        .catch(() => null);
      if (matches === null) {
        console.log(`  ${name} (${sel}): INVALID/ERROR`);
      } else {
        console.log(
          `  ${name} (${sel}): ${matches.length} match(es)` +
            (matches.length ? ` | ${snippet(matches.join(' | '))}` : '')
        );
      }
    }

    console.log('\n== heuristic candidates (top 5 by score) ==');
    const candidates = await page.evaluate(collectCandidatesInPage);
    const scored = candidates
      .map((c) => ({ ...c, score: scoreChordText(c.text) }))
      .sort((a, b) => b.score - a.score || a.text.length - b.text.length);
    if (scored.length === 0) console.log('  (no candidates collected)');
    for (const c of scored.slice(0, 5)) {
      console.log(`  <${c.tag}> score=${c.score} len=${c.text.length} | ${snippet(c.text, 50)}`);
    }
    const best = pickBestCandidate(candidates);
    console.log(
      '\n  pickBestCandidate ->',
      best
        ? `<${best.tag}> score=${best.score} (minScore=${config.detectMinScore}) ` +
            `${best.score >= config.detectMinScore ? 'PASS ✓' : 'BELOW THRESHOLD ✗'}`
        : 'null'
    );

    console.log('\n== extractChordText by strategy ==');
    for (const strategy of ['heuristic', 'auto', 'selector']) {
      const text = await extractChordText(page, strategy, config.detectMinScore);
      console.log(
        `  ${strategy}: ${text.length} chars` + (text.length ? ` | ${snippet(text, 50)}` : ' (EMPTY)')
      );
    }
    console.log('');
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error('validate-scrape failed:', err.message);
  process.exit(1);
});
