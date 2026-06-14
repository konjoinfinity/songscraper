// Crown Jewels — builds the Google Docs `batchUpdate` payload from scraped song
// data. Behavior is preserved exactly from the legacy pageScraper.js; the
// regression test (test/formatter.test.js vs test/formatter.fixture.json)
// guards it. Do not change the index math, the regexes, or the placeholders.

import {
  SECTION_TITLES,
  TITLES_SOURCE,
  TITLES_FLAGS,
  CHORDS_SOURCE,
  CHORDS_FLAGS,
  TITLE_PLACEHOLDER,
  COL2_PLACEHOLDER,
} from './constants.js';

/**
 * Strip the [Section] brackets, leaving the bare section name. The legacy
 * iteration order matters (e.g. "Chorus" is processed before "Chorus 1").
 * @param {string} text - the raw chart text
 * @returns {string} the chart with section brackets removed
 */
function stripBrackets(text) {
  let first = text;
  for (const title of SECTION_TITLES) {
    first = first.replaceAll(`[${title}]`, `${title}`);
  }
  return first;
}

/**
 * Find the first line (within the first 25) that is exactly a section title —
 * the real start of the chart.
 * @param {string[]} chartArr - the chart split into lines
 * @returns {number|undefined} the line index, or undefined if none found
 */
function findFirstSectionIndex(chartArr) {
  for (let i = 0; i < 25; i++) {
    const line = chartArr[i];
    // Operands are strings, so the legacy loose comparison equals strict.
    if (line && SECTION_TITLES.some((v) => line.trim() === v)) {
      return i;
    }
  }
  return undefined;
}

/**
 * Find the row (scanning 49→35) at which column 1 ends and column 2 begins —
 * the first blank-ish line (a single space) in that window.
 * @param {string[]} chartArr - the chart split into lines
 * @returns {number|undefined} the split index, or undefined if none found
 */
function findSplitIndex(chartArr) {
  const newArr = chartArr.slice(0, 52);
  for (let j = 49; j > 34; j--) {
    if (newArr[j] === ' ') {
      return j;
    }
  }
  return undefined;
}

/**
 * A single-use formatter. The `titles`/`chords` regexes are created once and
 * shared between buildBatchRequests (pass 1) and buildUnboldRequests (pass 2),
 * preserving the legacy stateful-`.test()` carryover across both passes.
 * Call buildBatchRequests first, then buildUnboldRequests once.
 * @param {{ rawText: string, title: string }} song - scraped chart + doc title
 * @returns {{ buildBatchRequests: () => object[], buildUnboldRequests: (cellContent: object[]) => object[] }}
 */
export function createFormatter({ rawText, title }) {
  const titles = new RegExp(TITLES_SOURCE, TITLES_FLAGS);
  const chords = new RegExp(CHORDS_SOURCE, CHORDS_FLAGS);

  /**
   * Pass 1: build the requests that fill column 1 (inserted text at indices with
   * bold/unbold guesses), replace the column-2 placeholder, and set the title.
   * @returns {object[]} the filtered batchUpdate requests
   */
  function buildBatchRequests() {
    const first = stripBrackets(rawText);
    const lines = first.split(/\r\n|\r|\n/);
    const newFirstIndex = findFirstSectionIndex(lines);
    const indexToSplit = findSplitIndex(lines);

    let indexCount = 4;
    const requests = [
      {
        replaceAllText: {
          replaceText: title,
          containsText: { text: TITLE_PLACEHOLDER, matchCase: true },
        },
      },
    ];

    let newFirst = first.split(/\n/);
    newFirst = newFirst.splice(newFirstIndex);
    newFirst.forEach((line, index) => {
      // Both tests run every iteration (even skipped lines) to advance regex
      // state, exactly as the legacy code did.
      const isTitles = titles.test(line);
      const isChords = chords.test(line.trim());
      if (Number(index) <= Number(indexToSplit)) {
        const bold = isTitles || isChords;
        requests.push({ insertText: { text: line, location: { index: indexCount + 1 } } });
        requests.push({
          updateTextStyle: {
            range: { startIndex: indexCount + 1, endIndex: indexCount + line.length },
            textStyle: { bold },
            fields: 'bold',
          },
        });
        indexCount = indexCount + line.length;
      }
    });

    const chartArr = first.split(/\n/);
    const colChart2 = chartArr.slice(indexToSplit + 1, chartArr.length);
    const toWrite = colChart2.join('\r\n');
    requests.push({
      replaceAllText: {
        replaceText: toWrite,
        containsText: { text: COL2_PLACEHOLDER, matchCase: true },
      },
    });

    // Drop updateTextStyle requests with an empty range (start === end).
    return requests.filter(
      (req) =>
        !(
          req.updateTextStyle &&
          req.updateTextStyle.range.startIndex === req.updateTextStyle.range.endIndex
        )
    );
  }

  /**
   * Pass 2: re-read the column-2 table cell content and unbold the lyric lines
   * (lines that are neither section titles nor chords).
   * @param {object[]} cellContent - body.content[2].table.tableRows[0].tableCells[1].content
   * @returns {object[]} the unbold updateTextStyle requests
   */
  function buildUnboldRequests(cellContent) {
    const unboldRequests = [];
    cellContent.forEach((line) => {
      const text = line.paragraph.elements[0].textRun.content;
      const isTitles = titles.test(text);
      const isChords = chords.test(text.trim());
      if (!isTitles && !isChords) {
        unboldRequests.push({
          updateTextStyle: {
            range: {
              startIndex: line.paragraph.elements[0].startIndex,
              endIndex: line.paragraph.elements[0].endIndex,
            },
            textStyle: { bold: false },
            fields: 'bold',
          },
        });
      }
    });
    return unboldRequests;
  }

  return { buildBatchRequests, buildUnboldRequests };
}
