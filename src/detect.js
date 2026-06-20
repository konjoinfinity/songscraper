// Heuristic fallback for locating the chord-chart text when the configured CSS
// selector fails (e.g. Ultimate Guitar changes its DOM/class names). Instead of
// a structural selector, we score candidate text blocks by their *content
// fingerprint* — chord density, section headers, and chord-style whitespace —
// and return the best match.
//
// The scoring functions are pure and unit-tested (test/detect.test.js).
// detectChordBlock() is the thin Puppeteer glue around them.

// A single whitespace-delimited token that looks like a chord. Anchored to the
// whole token: root [A-G], optional accidental, optional quality, optional
// extension number, optional second quality/tension, optional slash bass.
// Anchoring + the [A-G] root start is what keeps most English words out:
// "Bad"/"Cab"/"Face"/"Add" all fail because the 2nd char isn't a chord part.
const CHORD_TOKEN =
  /^[A-G](?:#|b)?(?:m|maj|min|dim|aug|sus|add|M)?\d{0,2}(?:sus|add|aug|dim)?\d{0,2}(?:\/[A-G](?:#|b)?)?$/;

// Non-chord tokens that still belong to a chord line: repeat counts (x4),
// no-chord marks, bar lines, and parenthesised passing notes.
const ANNOTATION_TOKEN = /^(?:x\d{1,2}|N\.?C\.?|\|+|:|\([^)]*\))$/i;

// A line that is a section header, with or without brackets.
const SECTION_LINE =
  /^\s*\[?(?:intro|verse|pre-?chorus|chorus|bridge|interlude|instrumental|solo|outro|riff|refrain|coda|hook|break|ending|tab|capo)\b[^\]]*\]?\s*$/i;

// Distinctive Ultimate Guitar page-chrome phrases. A real chord chart never
// contains these; a whole-page container (nav + toolbar + comments + footer) is
// littered with them. Used to disqualify a container candidate that out-scores the
// real <pre> purely by absorbing every chord-letter scattered across the page.
const PAGE_CHROME_MARKERS = [
  /\bdownload pdf\b/i,
  /\bautoscroll\b/i,
  /\bcreate correction\b/i,
  /\breport bad tab\b/i,
  /\bmore versions\b/i,
  /\bprivacy policy\b/i,
  /\bterms of service\b/i,
  /\ball rights reserved\b/i,
  /ultimate-guitar\.com/i,
  /\bwelcome offer\b/i,
  /\bupgrade to pro/i,
];
// How many distinct chrome markers flag a candidate as page chrome, not a chart.
const PAGE_CHROME_THRESHOLD = 3;

/**
 * Whether a single token reads as a chord (or a chord-line annotation).
 * @param {string} token
 * @returns {boolean}
 */
export function isChordToken(token) {
  if (!token) return false;
  return ANNOTATION_TOKEN.test(token) || CHORD_TOKEN.test(token);
}

/**
 * Classify a single line as a section header, chord line, lyric, or blank.
 * A line counts as chords when most of its tokens are chord-like, OR when it
 * has multiple chord tokens spaced out for alignment (the classic chords-above-
 * lyrics layout).
 * @param {string} line
 * @returns {'section'|'chord'|'lyric'|'blank'}
 */
export function classifyLine(line) {
  if (SECTION_LINE.test(line)) return 'section';
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 'blank';

  const chordish = tokens.filter(isChordToken).length;
  // Real chords only — annotations (x4, bar lines, parenthesised notes/counts like
  // "(15)") ride along on a chord line but cannot constitute one. Without this, a
  // version/rating list ("(15)", "(146)", "(29)") reads as chord lines and a stray
  // fragment out-scores a tiny real chart (e.g. Row Row Row Your Boat).
  const realChords = tokens.filter((token) => CHORD_TOKEN.test(token)).length;
  const ratio = chordish / tokens.length;
  const aligned = /\S\s{2,}\S/.test(line); // 2+ spaces between visible tokens

  if (realChords >= 1 && ratio >= 0.5) return 'chord';
  if (realChords >= 2 && aligned) return 'chord';
  return 'lyric';
}

/**
 * Break a block of text into its chord-chart line tallies. Pure and cheap; the
 * basis for both the absolute score and the density used to pick between nested
 * candidates.
 * @param {string} text
 * @returns {{ score: number, chord: number, section: number, aligned: number, nonBlank: number }}
 */
export function analyzeChordText(text) {
  const empty = { score: 0, chord: 0, section: 0, aligned: 0, nonBlank: 0 };
  if (!text) return empty;
  const lines = text.split(/\r\n|\r|\n/);

  let chord = 0;
  let section = 0;
  let aligned = 0;
  let nonBlank = 0;

  for (const line of lines) {
    const kind = classifyLine(line);
    if (kind !== 'blank') nonBlank += 1;
    if (kind === 'chord') chord += 1;
    else if (kind === 'section') section += 1;
    if (/\S\s{2,}\S/.test(line)) aligned += 1;
  }

  if (nonBlank < 4) return empty;
  if (chord === 0 && section === 0) return empty;
  return { score: chord * 2 + section * 3 + aligned, chord, section, aligned, nonBlank };
}

/**
 * Score how chord-chart-like a block of text is. Higher is better; 0 means "not
 * a chart". Section headers are weighted most (very distinctive), then chord
 * lines, with a small bonus for alignment whitespace. Blocks with too little
 * substance score 0 to avoid latching onto a stray two-line snippet.
 * @param {string} text
 * @returns {number}
 */
export function scoreChordText(text) {
  return analyzeChordText(text).score;
}

/**
 * The fraction of a block's non-blank lines that are actual chart lines (chords
 * or section headers). 1.0 means a pure chart; lower means the block also wraps
 * navigation, metadata, or lyrics-only text. Used to prefer the *tightest* block
 * that still contains the whole chart over a parent that dilutes it with chrome.
 * @param {{ chord: number, section: number, nonBlank: number }} stats - analyzeChordText() result
 * @returns {number} chart-line density in [0, 1]
 */
function chartDensity(stats) {
  return stats.nonBlank ? (stats.chord + stats.section) / stats.nonBlank : 0;
}

// A modest preference for <pre> elements. Chord charts are preformatted text, so
// UG (and virtually every chord site) renders the bare chart in a <pre>; a parent
// that re-wraps it with a tuning/key/metadata preamble is a <div>. Tag names are
// stable (unlike UG's build-hashed class names), so this preference resolves the
// common "<pre> core vs <div> superset" case without the brittleness detect.js
// exists to avoid. If the chart is ever *not* in a <pre>, no candidate gets the
// bonus and selection falls back to pure density.
const PRE_BONUS = 1.3;

/**
 * Selection weight for a candidate: chart score scaled by chart density and a
 * small <pre>-tag bonus. Density demotes a parent wrapper that inherits the
 * chart's lines but dilutes them with nav/metadata (high score, low density) and
 * starves stray fragments (high density, low score). The <pre> bonus then breaks
 * the residual "core vs tuning-preamble superset" tie toward the tight chart.
 * @param {{ tag?: string, text: string }} candidate
 * @param {{ score: number, chord: number, section: number, nonBlank: number }} stats - analyzeChordText() result
 * @returns {number}
 */
function candidateWeight(candidate, stats) {
  const tagBonus = candidate.tag === 'pre' ? PRE_BONUS : 1;
  return stats.score * chartDensity(stats) * tagBonus;
}

/**
 * Whether a block is Ultimate Guitar page chrome (nav/toolbar/comments/footer)
 * rather than a chart. Such a container can out-score the real <pre> by absorbing
 * every chord-letter on the page (comments, "Tuning: E A D G B E", chord legend),
 * so it is disqualified before scoring rather than demoted by density alone.
 * @param {string} text
 * @returns {boolean}
 */
export function looksLikePageChrome(text) {
  if (!text) return false;
  let hits = 0;
  for (const marker of PAGE_CHROME_MARKERS) {
    if (marker.test(text) && (hits += 1) >= PAGE_CHROME_THRESHOLD) return true;
  }
  return false;
}

/**
 * Whether a block is a bare chord-diagram legend (every non-blank line is a single
 * chord, no lyrics, no section headers) rather than a chart. UG renders the
 * "chords used" fingering list as its own block; with perfect chart-line density it
 * would otherwise beat the real chart (whose lyrics dilute its density). A genuine
 * chart always carries lyric or section lines, so this never rejects one.
 * @param {{ chord: number, section: number, nonBlank: number }} stats - analyzeChordText() result
 * @returns {boolean}
 */
export function isChordLegend(stats) {
  return stats.section === 0 && stats.nonBlank > 0 && stats.chord === stats.nonBlank;
}

/**
 * Choose the best candidate block. Selection is tiered: any scoring <pre> outranks
 * every non-<pre>, because UG (and every chord site) renders the bare chart in a
 * <pre> while the decoys that out-score a tiny chart on raw count — the A–Z artist
 * index, the version/rating list, nav — are <div>s. Within a tier, rank by
 * `candidateWeight` (density-aware), breaking ties toward the shorter block. The
 * returned `score` is the raw score so callers can still threshold on absolute
 * substance; page-chrome containers and bare chord-diagram legends are disqualified
 * up front so they cannot win even within the <div> tier.
 * @param {Array<{ text: string, [k: string]: unknown }>} candidates
 * @returns {({ text: string, score: number, [k: string]: unknown })|null}
 */
export function pickBestCandidate(candidates) {
  let best = null;
  for (const candidate of candidates) {
    if (looksLikePageChrome(candidate.text)) continue;
    const stats = analyzeChordText(candidate.text);
    if (stats.score <= 0) continue;
    if (isChordLegend(stats)) continue;
    const weighted = candidateWeight(candidate, stats);
    const isPre = candidate.tag === 'pre';
    const scored = { ...candidate, score: stats.score, weighted, isPre };
    const sameTier = best && isPre === best.isPre;
    const better =
      !best ||
      (isPre && !best.isPre) ||
      (sameTier &&
        (weighted > best.weighted ||
          (weighted === best.weighted && candidate.text.length < best.text.length)));
    if (better) best = scored;
  }
  return best;
}

/**
 * Browser-context collector. Gathers <pre> blocks plus leaf-ish text containers
 * (few element children, multi-line text) as detection candidates. Must be
 * self-contained — it is serialized into the page by page.evaluate().
 * @returns {Array<{ tag: string, text: string }>}
 */
/* istanbul ignore next — runs in the browser (via page.evaluate), covered by live integration */
function collectCandidatesInPage() {
  const out = [];
  const seen = new Set();
  /**
   * Record an element's text as a candidate if it is multi-line and not huge.
   * @param {Element} el
   * @returns {void}
   */
  const consider = (el) => {
    const text = el.innerText || el.textContent || '';
    if (!text) return;
    if (text.length > 20000) return; // too large — almost certainly a container
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

/**
 * Locate the chord-chart text on a page heuristically. Returns the raw text of
 * the best-scoring block, or null if nothing clears `minScore`. The threshold is
 * what lets this run as the *primary* strategy safely: a weak best-candidate is
 * rejected (→ caller falls back to the CSS selector) rather than silently
 * scraping the wrong block.
 * @param {import('puppeteer').Page} page
 * @param {number} [minScore=0] - reject the best candidate below this score
 * @returns {Promise<string|null>}
 */
export async function detectChordBlock(page, minScore = 0) {
  const candidates = await page.evaluate(collectCandidatesInPage);
  const best = pickBestCandidate(candidates);
  if (!best || best.score < minScore) {
    if (best) {
      console.warn(
        `[detect] best candidate score ${best.score} < min ${minScore}; rejecting heuristic match.`
      );
    }
    return null;
  }
  console.warn(
    `[detect] heuristic matched a <${best.tag}> (score ${best.score}). ` +
      'If the configured selector is stale, re-pin selectors.chordBlock in src/config.js.'
  );
  return best.text;
}

/**
 * Fallback for title/artist from the document title, which UG formats as
 * "<Song> Chords by <Artist> ...". Used when the title/artist selectors fail.
 * @param {string} docTitle - document.title
 * @returns {{ title: string, artist: string }|null}
 */
export function parseTitleFromDocTitle(docTitle) {
  if (!docTitle) return null;
  const match = docTitle.match(/^(.*?)\s+Chords?\s+by\s+(.*?)(?:\s*[@|].*)?$/i);
  if (!match) return null;
  return { title: match[1].trim(), artist: match[2].trim() };
}
