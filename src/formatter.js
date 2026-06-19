// Builds the Google Docs `batchUpdate` payload from scraped song data, in two
// passes over a section-aware Layout (see layout.js):
//
//   Pass 1 (buildReplaceRequests): replace the title + both column placeholders
//     ("col1"/"col2") with the rendered column text. Pure string assembly — no
//     index math, so the duplicate-column bug class is structurally impossible.
//   Pass 2 (buildStyleRequests): after the doc is updated and re-read, bold each
//     paragraph by its rendered kind (chord/section bold, lyric not), taking the
//     start/end indices straight from the document — never computed by hand.
//
// Bold is decided per-line from the Layout, deterministically; there is no shared
// global regex state between lines (the source of the old alternating-bold bug).

import { buildLayout } from './layout.js';
import { config } from './config.js';
import { TITLE_PLACEHOLDER, COL1_PLACEHOLDER, COL2_PLACEHOLDER } from './constants.js';

/**
 * Serialize a column's rendered sections into a single cell string plus the flat
 * list of lines that produced it (one blank-line separator between sections). The
 * text and the lines array stay 1:1 — `text.split('\n')` has `lines.length`
 * entries — so pass 2 can style paragraph i from line i.
 * @param {import('./layout.js').RenderedSection[]} sections
 * @returns {{ text: string, lines: import('./layout.js').RenderedLine[] }}
 */
function serializeColumn(sections) {
  const lines = [];
  sections.forEach((sec, i) => {
    if (i > 0) lines.push({ kind: 'blank', text: '' });
    lines.push(...sec.renderLines);
  });
  return { text: lines.map((line) => line.text).join('\n'), lines };
}

/**
 * Bold each cell paragraph by its rendered kind (chord/section bold, lyric not).
 * Aligns by *content position*, not raw index: only non-empty paragraphs are
 * matched against non-blank rendered lines, in order — so any stray empty
 * paragraph Docs may insert (leading, interior, or trailing) can't shift the
 * styling. Indices come straight from the re-read document. A count mismatch is
 * logged (never silently mis-styled).
 * @param {object[]|null} cellContent - the cell's content array from documents.get
 * @param {import('./layout.js').RenderedLine[]} renderLines - the lines written to that cell
 * @returns {object[]} updateTextStyle requests
 */
function styleCellByOrder(cellContent, renderLines) {
  if (!cellContent) return [];
  const paragraphs = cellContent.filter((entry) => {
    const element = entry.paragraph?.elements?.[0];
    return element && element.startIndex != null && element.startIndex < element.endIndex;
  });
  const lines = renderLines.filter((line) => line.text.trim() !== '');
  if (paragraphs.length !== lines.length) {
    console.warn(
      `[formatter] style pass: ${paragraphs.length} non-empty paragraphs vs ${lines.length} ` +
        'rendered lines — styling the aligned prefix.'
    );
  }
  const requests = [];
  const count = Math.min(paragraphs.length, lines.length);
  for (let i = 0; i < count; i++) {
    const { startIndex, endIndex } = paragraphs[i].paragraph.elements[0];
    const bold = lines[i].kind !== 'lyric';
    requests.push({
      updateTextStyle: { range: { startIndex, endIndex }, textStyle: { bold }, fields: 'bold' },
    });
  }
  return requests;
}

/**
 * A single-use formatter bound to one scraped chart. `buildReplaceRequests` runs
 * first (pass 1); after the doc is updated and both cells are re-read,
 * `buildStyleRequests` runs once (pass 2).
 * @param {{ rawText: string, title: string }} song - scraped chart + doc title
 * @returns {{ buildReplaceRequests: () => object[], buildStyleRequests: (col1Content: object[]|null, col2Content: object[]|null) => object[] }}
 */
export function createFormatter({ rawText, title }) {
  const layout = buildLayout(rawText, config.format);
  const col1 = serializeColumn(layout.col1);
  // Overflow sections (beyond one page) append to column two, flowing whole onto
  // page 2 — never split across the boundary.
  const col2 = serializeColumn([...layout.col2, ...layout.overflow]);

  /**
   * Pass 1: replace the title and both column placeholders. No index math.
   * @returns {object[]}
   */
  function buildReplaceRequests() {
    return [
      [title, TITLE_PLACEHOLDER],
      [col1.text, COL1_PLACEHOLDER],
      [col2.text, COL2_PLACEHOLDER],
    ].map(([replaceText, placeholder]) => ({
      replaceAllText: { replaceText, containsText: { text: placeholder, matchCase: true } },
    }));
  }

  /**
   * Pass 2: bold each paragraph in both cells by its rendered kind.
   * @param {object[]|null} col1Content - left cell content from documents.get
   * @param {object[]|null} col2Content - right cell content from documents.get
   * @returns {object[]}
   */
  function buildStyleRequests(col1Content, col2Content) {
    return [
      ...styleCellByOrder(col1Content, col1.lines),
      ...styleCellByOrder(col2Content, col2.lines),
    ];
  }

  return { buildReplaceRequests, buildStyleRequests };
}
