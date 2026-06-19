// Section-aware layout engine. Pure (no Google/Puppeteer imports) so the whole
// pipeline is unit-testable: parse the raw chart into sections, compact repeated
// chord lines, detect sections that repeat an earlier one, render each section
// (full or as a one-liner), and pack whole sections into two columns without ever
// splitting a section across the boundary. Adaptive: full detail by default, then
// compress repeats only as needed to fit one page.
//
// Line classification is delegated to detect.js (classifyLine) — the same
// battle-tested, unit-tested logic the scraper uses — so bold/lyric decisions are
// deterministic (no global-regex state to carry over between lines).

import { classifyLine } from './detect.js';

/** @typedef {{ kind: 'section'|'chord'|'lyric'|'blank', text: string }} RenderedLine */
/** @typedef {{ name: string|null, heading: string|null, lines: RenderedLine[] }} Section */
/** @typedef {{ renderLines: RenderedLine[], compressed: boolean, lineCount: number }} RenderedSection */
/** @typedef {{ col1: RenderedSection[], col2: RenderedSection[], overflow: RenderedSection[], fits: boolean }} Layout */

// A line that is just a bracketed heading, e.g. "[Pre-Chorus]" — an unambiguous
// Ultimate Guitar section marker even when its word isn't in detect's vocabulary.
const BRACKETED_HEADING = /^\s*\[.+\]\s*$/;
// Heading-shaped lines that are actually preamble, not musical sections: the capo
// note, the [Chords] fingering legend, tuning/tutorial notes. These (and the lines
// under them, before the first real section) are dropped.
const PREAMBLE_HEADING = /^(?:capo|chords?|tuning|tutorial|tab)\b/i;

// Lines that mark the start of Ultimate Guitar's trailing chrome — ratings, ads,
// nav, the instrument/chord legend — or a tabber's sign-off / link. Everything
// from the first such line onward is dropped. Matched against the trimmed line.
const FOOTER_MARKERS = [
  /^thanks for using/i,
  /^tabbed by\b/i,
  /^create correction$/i,
  /^report bad tab$/i,
  /^last update:/i,
  /^please,? rate/i,
  /^(?:welcome offer|try now|play next)$/i,
  /^strumming pattern$/i,
  /^there is no strumming pattern/i,
  /^suggest correction$/i,
  /^pro play this tab$/i,
  /^was this info helpful/i,
  /^(?:print|x)$/i,
  /(?:youtube\.com|youtu\.be)/i,
  /^https?:\/\/\S+$/i,
  /^-{20,}\s*$/,
];

/**
 * Whether a line marks the start of trailing non-chart content (UG chrome, an ad,
 * a sign-off, a link, or a long divider rule).
 * @param {string} line
 * @returns {boolean}
 */
function isFooterLine(line) {
  const trimmed = line.trim();
  return FOOTER_MARKERS.some((re) => re.test(trimmed));
}

/** Collapse all runs of whitespace to a single space and trim. */
const collapseSpaces = (text) => text.trim().replace(/\s+/g, ' ');

/**
 * Estimated *physical* line count: a line longer than the column width wraps onto
 * multiple printed lines, so it must count as more than one toward the page
 * budget. With charsPerColumn = Infinity this is just the line count (used by the
 * pure render unit tests).
 * @param {RenderedLine[]} renderLines
 * @param {number} charsPerColumn - approx characters before a line wraps
 * @returns {number}
 */
function countRenderedLines(renderLines, charsPerColumn) {
  return renderLines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(line.text.length / charsPerColumn)),
    0
  );
}

/** Build a RenderedSection, sizing it for the given column width (wrap-aware). */
const renderedSection = (renderLines, compressed, charsPerColumn = Infinity) => ({
  renderLines,
  compressed,
  lineCount: countRenderedLines(renderLines, charsPerColumn),
});

/**
 * Whether a raw line opens a new section. A bracketed line (`[Intro]`) always is.
 * A bare line counts only if it's a recognized section word AND short enough to be
 * a real label — not a sentence that merely begins with one ("Intro chords as an
 * example…", the Spanish lyric "Solo con pensarlo…"). Real UG headings are ≤4
 * words / ≤24 chars; longer keyword-initial prose is body/preamble, not a heading.
 * @param {string} line
 * @returns {boolean}
 */
function isHeading(line) {
  if (BRACKETED_HEADING.test(line)) return true;
  if (classifyLine(line) !== 'section') return false;
  const trimmed = line.trim();
  return trimmed.length <= 24 && trimmed.split(/\s+/).length <= 4;
}

/**
 * The bare display heading for a section line: brackets stripped, trimmed.
 * @param {string} line
 * @returns {string}
 */
function headingName(line) {
  return line.trim().replace(/^\[/, '').replace(/\]$/, '').trim();
}

/**
 * Split raw chart text into sections. Section boundaries are heading lines;
 * content before the first heading (Capo/tuning/chord-legend preamble) is dropped,
 * and parsing stops at the trailing footer. A chart with no headings becomes a
 * single untitled section.
 * @param {string} rawText
 * @returns {Section[]}
 */
export function parseSections(rawText) {
  if (!rawText || !rawText.trim()) return [];
  const lines = rawText.split(/\r\n|\r|\n/);
  const sections = [];
  let current = null;
  for (const raw of lines) {
    if (isHeading(raw)) {
      const heading = headingName(raw);
      // A preamble heading (Capo/Chords legend/tuning) never opens a section; while
      // still in the preamble it's skipped along with the lines beneath it.
      if (PREAMBLE_HEADING.test(heading)) continue;
      current = { name: heading.toLowerCase(), heading, lines: [] };
      sections.push(current);
      continue;
    }
    if (!current) continue; // drop preamble before the first real heading
    // Footer is only checked inside the chart, so preamble links/URLs don't end it.
    if (isFooterLine(raw)) break;
    // A body line that classifies as 'section' but wasn't a heading (keyword-initial
    // prose, e.g. "Solo con pensarlo…") is lyric text, not a heading — don't bold it.
    const kind = classifyLine(raw);
    current.lines.push({ kind: kind === 'section' ? 'lyric' : kind, text: raw });
  }
  if (sections.length > 0) return sections;
  // No headings at all — treat content up to the footer as one section.
  const body = [];
  for (const raw of lines) {
    if (isFooterLine(raw)) break;
    body.push({ kind: classifyLine(raw), text: raw });
  }
  return [{ name: null, heading: null, lines: body }];
}

/**
 * Drop blank lines and collapse consecutive identical chord lines to one (e.g. an
 * Intro printed four times becomes a single chord line).
 * @param {Section} section
 * @returns {Section}
 */
export function compactSection(section) {
  const out = [];
  for (const line of section.lines) {
    if (line.kind === 'blank') continue;
    const prev = out[out.length - 1];
    const dupChord =
      line.kind === 'chord' && prev?.kind === 'chord' && prev.text.trim() === line.text.trim();
    if (dupChord) continue;
    out.push(line);
  }
  return { ...section, lines: out };
}

/**
 * A canonical signature of a section's musical content, for equality across
 * repeats. Whitespace-normalized and NFC-normalized; lyric lines are lowercased
 * while chord lines keep their case (Em != EM). The heading is excluded so
 * "Chorus 1" and "Chorus 2" match when their bodies do.
 * @param {Section} section
 * @returns {string}
 */
export function sectionSignature(section) {
  return section.lines
    .filter((line) => line.kind !== 'blank')
    .map((line) => {
      const norm = collapseSpaces(line.text.normalize('NFC'));
      return line.kind === 'lyric' ? norm.toLowerCase() : norm;
    })
    .join('\n');
}

/**
 * Render a section in full. A chord-only section that compacts to a single chord
 * line becomes the one-liner "Heading - Em G D"; otherwise it is a heading line
 * followed by its body lines.
 * @param {Section} section
 * @param {number} [charsPerColumn=Infinity] - column width for wrap-aware sizing
 * @returns {RenderedSection}
 */
export function renderFull(section, charsPerColumn = Infinity) {
  const body = section.lines;
  const chordOnly = body.length > 0 && body.every((line) => line.kind === 'chord');
  if (section.heading && chordOnly && body.length === 1) {
    return renderedSection(
      [{ kind: 'chord', text: `${section.heading} - ${collapseSpaces(body[0].text)}` }],
      false,
      charsPerColumn
    );
  }
  const lines = [];
  if (section.heading) lines.push({ kind: 'section', text: section.heading });
  lines.push(...body);
  return renderedSection(lines, false, charsPerColumn);
}

/**
 * Render a section as a single compressed one-liner "Heading - <chords>", used for
 * repeats when the chart must shrink to fit one page. Falls back to a full render
 * for an unheaded section (a bare one-liner would be meaningless).
 * @param {Section} section
 * @param {number} [charsPerColumn=Infinity] - column width for wrap-aware sizing
 * @returns {RenderedSection}
 */
export function renderCompressed(section, charsPerColumn = Infinity) {
  if (!section.heading) return renderFull(section, charsPerColumn);
  const firstChord = section.lines.find((line) => line.kind === 'chord');
  const text = firstChord
    ? `${section.heading} - ${collapseSpaces(firstChord.text)}`
    : section.heading;
  return renderedSection([{ kind: firstChord ? 'chord' : 'section', text }], true, charsPerColumn);
}

/** Total rendered line count of a column, including one blank separator between sections. */
function columnLineCount(sections) {
  const lines = sections.reduce((sum, sec) => sum + sec.lineCount, 0);
  return lines + Math.max(0, sections.length - 1);
}

/**
 * Pack whole sections into two columns without splitting any section. Fill column
 * one to the budget, then column two; anything left flows to `overflow` (page 2).
 * An empty column always accepts the next section, so a section larger than the
 * budget gets its own column rather than being split.
 * @param {RenderedSection[]} sections
 * @param {number} budget - target line count per column
 * @returns {Layout}
 */
export function packColumns(sections, budget) {
  const cols = [[], []];
  const overflow = [];
  let col = 0;
  for (const sec of sections) {
    while (col < 2) {
      const cur = cols[col];
      const separator = cur.length ? 1 : 0;
      if (!cur.length || columnLineCount(cur) + separator + sec.lineCount <= budget) break;
      col += 1;
    }
    if (col >= 2) overflow.push(sec);
    else cols[col].push(sec);
  }
  return { col1: cols[0], col2: cols[1], overflow, fits: overflow.length === 0 };
}

/**
 * Build the two-column layout for a chart. Full detail by default; if it would
 * overflow one page, compress repeated sections (those whose content matches an
 * earlier section) into one-liners — latest repeats first — until it fits.
 * @param {string} rawText
 * @param {{ columnLineBudget: number, charsPerColumn?: number }} opts
 * @returns {Layout}
 */
export function buildLayout(rawText, opts) {
  const budget = opts?.columnLineBudget ?? 40;
  const charsPerColumn = opts?.charsPerColumn ?? Infinity;
  const sections = parseSections(rawText)
    .map(compactSection)
    .filter((sec) => sec.lines.length > 0 || sec.heading);
  if (sections.length === 0) return { col1: [], col2: [], overflow: [], fits: true };

  const sigs = sections.map(sectionSignature);
  const repeatable = sections.map(
    (sec, i) => Boolean(sec.heading) && sigs[i] !== '' && sigs.indexOf(sigs[i]) < i
  );

  const rendered = sections.map((sec) => renderFull(sec, charsPerColumn));
  let layout = packColumns(rendered, budget);
  for (let i = sections.length - 1; i >= 0 && !layout.fits; i--) {
    if (!repeatable[i]) continue;
    rendered[i] = renderCompressed(sections[i], charsPerColumn);
    layout = packColumns(rendered, budget);
  }
  return layout;
}
