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

// Strip the [Section] brackets, leaving the bare section name (legacy order matters).
function stripBrackets(text) {
  let first = text;
  for (const title of SECTION_TITLES) {
    first = first.replaceAll(`[${title}]`, `${title}`);
  }
  return first;
}

// Find the first line that is a section title (the chart's real start), and the
// row at which column 1 ends / column 2 begins. Mirrors the legacy index math,
// including the intentionally-loose `==` and the possibility of `undefined`.
function computeSplitIndices(first) {
  const chartArr = first.split(/\r\n|\r|\n/);
  let newFirstIndex;
  for (let i = 0; i < 25; i++) {
    let found = false;
    if (SECTION_TITLES.length > 0) {
      // Operands are strings, so the legacy loose comparison is equivalent to strict.
      found = SECTION_TITLES.some((v) => chartArr[i] && chartArr[i].trim() === v);
    }
    if (found === true) {
      newFirstIndex = i;
      break;
    }
  }

  const newArr = chartArr.slice(0, 52);
  let indexToSplit;
  for (let j = 49; j > 34; j--) {
    if (newArr[j] === ' ') {
      indexToSplit = j;
      break;
    }
  }
  return { newFirstIndex, indexToSplit };
}

// A single-use formatter. The `titles`/`chords` regexes are created once and
// shared between buildBatchRequests (pass 1) and buildUnboldRequests (pass 2),
// preserving the legacy stateful-`.test()` carryover across both passes.
// Call buildBatchRequests first, then buildUnboldRequests once.
export function createFormatter({ rawText, title }) {
  const titles = new RegExp(TITLES_SOURCE, TITLES_FLAGS);
  const chords = new RegExp(CHORDS_SOURCE, CHORDS_FLAGS);

  function buildBatchRequests() {
    const first = stripBrackets(rawText);
    const { newFirstIndex, indexToSplit } = computeSplitIndices(first);

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
      // Both tests run every iteration (even skipped lines) to advance regex state,
      // exactly as the legacy code did.
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
    return requests.filter((req) => {
      if (
        req.updateTextStyle &&
        req.updateTextStyle.range.startIndex === req.updateTextStyle.range.endIndex
      ) {
        return false;
      }
      return true;
    });
  }

  // Pass 2: re-read the column-2 table cell content and unbold the lyric lines
  // (lines that are neither section titles nor chords). `cellContent` is the
  // array at body.content[2].table.tableRows[0].tableCells[1].content.
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
