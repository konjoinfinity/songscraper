// Captures the legacy pageScraper.js formatter output as a golden regression
// fixture, BEFORE the Phase-1 refactor. The logic below is copied verbatim from
// the legacy listFiles() request-building path (no Docs API — we serialize the
// `filteredRequests` array). The new src/formatter.js must reproduce this exactly.
//
// Run: npm run fixture
//
// Sample input: the real Ultimate-Guitar-format chart embedded in the repo's
// testing.js ("The A Team" — Ed Sheeran). Deterministic and network-independent,
// which is exactly what a regression guard needs.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// The sample chart ("The A Team" — Ed Sheeran), in real Ultimate-Guitar <pre>
// format. Originally lifted from the legacy testing.js scratch file; now a stable
// fixture so the golden payload is reproducible.
const rawText = readFileSync(join(repoRoot, 'test', 'fixtures', 'sample-chart.txt'), 'utf8');

const newTitle = 'The A Team- Ed Sheeran';

// ── Verbatim legacy section-title list (pageScraper.js lines 78-144) ──
const sectionTitles = [
  'Chorus', 'Verse', 'Verse 1', 'Verse 2', 'Intro', 'Pre-chorus', 'Interlude',
  'Bridge', 'Intro Tab', 'Instrumental', 'Outro', 'Solo', 'Post-Chorus',
  'Bridge 1', 'Bridge 2', 'Chorus 1', 'Chorus 2', 'Verse 3', 'Verse 4', 'Verse 5',
  'Outro Solo', 'Harmonies', 'Chorus/Outro', 'Pre-Chorus', 'Chorus 3', 'Chorus 4',
  'Refrain', 'Bridge 3', 'Transition', 'Interlude Solo', 'Verse 6', 'Verse 7',
  'Pre-Chorus A', 'Pre-Chorus B', 'Pre-Verse', 'Link', 'Solo Part 1', 'Solo Part 2',
  'Fill', 'Intro 1', 'Intro 2', 'Riff', 'Interlude 1', 'Interlude 2',
  'Riff/Instrumental', 'Coda', 'Capo', 'Instrumental Fill', 'Solo Chords', 'Riff 1',
  'Riff 2', 'Riff 1 cont.', 'Break 1', 'Break 2', 'Break', 'Chords', 'Chorus 5',
  'Chorus 6', 'Chorus 7', 'Chorus 8', 'Pre Chorus', 'Verse I', 'Verse II',
  'Verse III', 'Verse IV',
];

// ── Verbatim legacy preprocessing ──
let first = rawText;
let indexToSplit;

sectionTitles.forEach((title) => {
  first = first.replaceAll(`[${title}]`, `${title}`);
});

let chartArr = first.split(/\r\n|\r|\n/);
let newFirstIndex;
for (var i = 0; i < 25; i++) {
  let found = false;
  if (sectionTitles && sectionTitles.length > 0) {
    found = sectionTitles.some((v) => chartArr[i] && chartArr[i].trim() == v);
  }
  if (found === true) {
    newFirstIndex = i;
    break;
  }
}

let newArr = chartArr.slice(0, 52);
for (var j = 49; j > 34; j--) {
  if (newArr[j] === ' ') {
    indexToSplit = j;
    break;
  }
}

// ── Verbatim legacy request building (listFiles) ──
const titles =
  /(Chorus|Verse|Verse 1|Verse 2|Intro|Pre-chorus|Interlude|Bridge|Intro Tab|Instrumental|Outro|Solo|Post-Chorus|Bridge 1|Bridge 2|Chorus 1|Chorus 2|Verse 3|Verse 4|Verse 5|Outro Solo|Harmonies|Coda|Pre-Chorus|Chorus 3|Chorus 4|Refrain|Bridge 3|Transition|Interlude Solo|Verse 6|Verse 7|Pre-Chorus A|Pre-Chorus B|Pre-Verse|Link|Solo Part 1|Solo Part 2|Fill|Intro 1|Intro 2|Riff|Riff 1|Riff 2|Interlude 1|Interlude 2|Chorus\/Outro|Riff\/Instrumental|Capo|Instrumental Fill|Solo Chords|Riff 1|Riff 2|Riff 1 cont.|Break 1|Break 2|Break|Chorus 5|Chorus 6|Chorus 7|Chorus 8|Pre Chorus|Verse I|Verse II|Verse III|Verse IV)/gi;
const chords =
  /[A-G][#b]?\d?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?\d?)?\*?\*?\*?(\s+[A-G][#b]?\d?(m|maj|dim|aug|sus|add|mmaj)?\d?(\/[A-G][#b]?\d?)?\*?\*?\*?)*(?:\s+slide)?(?:\s+N.C.)?(?:\s+x\d\d?\d?\d?\d?\d?)?(?:|)?(?:\:)?/g;

var indexCount = 4;
const requests = [
  {
    replaceAllText: {
      replaceText: newTitle,
      containsText: { text: 'Song Title - Artist Name', matchCase: true },
    },
  },
];

let newFirst = first.split(/\n/);
newFirst = newFirst.splice(newFirstIndex);
newFirst.forEach((line, index) => {
  let isTitles = titles.test(line);
  let isChords = chords.test(line.trim());
  if (Number(index) <= Number(indexToSplit)) {
    if (!isTitles && !isChords) {
      requests.push({ insertText: { text: line, location: { index: indexCount + 1 } } });
      requests.push({
        updateTextStyle: {
          range: { startIndex: indexCount + 1, endIndex: indexCount + line.length },
          textStyle: { bold: false },
          fields: 'bold',
        },
      });
      indexCount = indexCount + line.length;
    } else {
      requests.push({ insertText: { text: line, location: { index: indexCount + 1 } } });
      requests.push({
        updateTextStyle: {
          range: { startIndex: indexCount + 1, endIndex: indexCount + line.length },
          textStyle: { bold: true },
          fields: 'bold',
        },
      });
      indexCount = indexCount + line.length;
    }
  }
});

let chartArr2 = first.split(/\n/);
let colChart2 = chartArr2.slice(indexToSplit + 1, chartArr2.length);
let toWrite = colChart2.join('\r\n');
requests.push({
  replaceAllText: {
    replaceText: toWrite,
    containsText: { text: 'col2', matchCase: true },
  },
});

const filteredRequests = requests.filter((req) => {
  if (
    req.updateTextStyle &&
    req.updateTextStyle.range.startIndex === req.updateTextStyle.range.endIndex
  ) {
    return false;
  }
  return true;
});

// ── Write the fixture ──
mkdirSync(join(repoRoot, 'test'), { recursive: true });
const fixture = {
  description:
    'Golden batchUpdate payload from the legacy pageScraper.js formatter. Regression guard for src/formatter.js. Regenerate only with explicit sign-off.',
  input: { rawText, title: newTitle },
  requests: filteredRequests,
};
writeFileSync(
  join(repoRoot, 'test', 'formatter.fixture.json'),
  JSON.stringify(fixture, null, 2) + '\n'
);
console.log(
  `Wrote test/formatter.fixture.json — ${filteredRequests.length} requests, ` +
    `newFirstIndex=${newFirstIndex}, indexToSplit=${indexToSplit}`
);
