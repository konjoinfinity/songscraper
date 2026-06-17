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
// Trailing UG boilerplate to stop parsing at (keeps it out of the last section).
const FOOTER = /thanks for using/i;

/** Collapse all runs of whitespace to a single space and trim. */
const collapseSpaces = (text) => text.trim().replace(/\s+/g, ' ');

/** Build a RenderedSection from its lines. */
const renderedSection = (renderLines, compressed) => ({
  renderLines,
  compressed,
  lineCount: renderLines.length,
});

/**
 * Whether a raw line opens a new section (a bracketed heading or a recognized
 * section word).
 * @param {string} line
 * @returns {boolean}
 */
function isHeading(line) {
  return BRACKETED_HEADING.test(line) || classifyLine(line) === 'section';
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
    if (FOOTER.test(raw)) break;
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
    current.lines.push({ kind: classifyLine(raw), text: raw });
  }
  if (sections.length > 0) return sections;
  // No headings at all — treat the whole (pre-footer) chart as one section.
  const body = [];
  for (const raw of lines) {
    if (FOOTER.test(raw)) break;
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
 * @returns {RenderedSection}
 */
export function renderFull(section) {
  const body = section.lines;
  const chordOnly = body.length > 0 && body.every((line) => line.kind === 'chord');
  if (section.heading && chordOnly && body.length === 1) {
    return renderedSection(
      [{ kind: 'chord', text: `${section.heading} - ${collapseSpaces(body[0].text)}` }],
      false
    );
  }
  const lines = [];
  if (section.heading) lines.push({ kind: 'section', text: section.heading });
  lines.push(...body);
  return renderedSection(lines, false);
}

/**
 * Render a section as a single compressed one-liner "Heading - <chords>", used for
 * repeats when the chart must shrink to fit one page. Falls back to a full render
 * for an unheaded section (a bare one-liner would be meaningless).
 * @param {Section} section
 * @returns {RenderedSection}
 */
export function renderCompressed(section) {
  if (!section.heading) return renderFull(section);
  const firstChord = section.lines.find((line) => line.kind === 'chord');
  const text = firstChord
    ? `${section.heading} - ${collapseSpaces(firstChord.text)}`
    : section.heading;
  return renderedSection([{ kind: firstChord ? 'chord' : 'section', text }], true);
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
 * @param {{ columnLineBudget: number }} opts
 * @returns {Layout}
 */
export function buildLayout(rawText, opts) {
  const budget = opts?.columnLineBudget ?? 40;
  const sections = parseSections(rawText)
    .map(compactSection)
    .filter((sec) => sec.lines.length > 0 || sec.heading);
  if (sections.length === 0) return { col1: [], col2: [], overflow: [], fits: true };

  const sigs = sections.map(sectionSignature);
  const repeatable = sections.map(
    (sec, i) => Boolean(sec.heading) && sigs[i] !== '' && sigs.indexOf(sigs[i]) < i
  );

  const rendered = sections.map(renderFull);
  let layout = packColumns(rendered, budget);
  for (let i = sections.length - 1; i >= 0 && !layout.fits; i--) {
    if (!repeatable[i]) continue;
    rendered[i] = renderCompressed(sections[i]);
    layout = packColumns(rendered, budget);
  }
  return layout;
}
