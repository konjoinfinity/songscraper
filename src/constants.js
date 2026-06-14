// Crown Jewels constants — copied verbatim from the legacy pageScraper.js.
// These patterns drive the bold/unbold formatting decisions. DO NOT alter them
// without regenerating test/formatter.fixture.json and getting explicit sign-off.
//
// Note: `titles` and `chords` are intentionally GLOBAL regexes. The legacy code
// relies on the stateful `.test()` behavior (advancing lastIndex) within a single
// formatter invocation. To preserve that exactly, the formatter constructs fresh
// RegExp instances per invocation from these sources — see buildBatchRequests.

// Used for [Section] bracket stripping and locating the first section line.
export const SECTION_TITLES = [
  'Chorus',
  'Verse',
  'Verse 1',
  'Verse 2',
  'Intro',
  'Pre-chorus',
  'Interlude',
  'Bridge',
  'Intro Tab',
  'Instrumental',
  'Outro',
  'Solo',
  'Post-Chorus',
  'Bridge 1',
  'Bridge 2',
  'Chorus 1',
  'Chorus 2',
  'Verse 3',
  'Verse 4',
  'Verse 5',
  'Outro Solo',
  'Harmonies',
  'Chorus/Outro',
  'Pre-Chorus',
  'Chorus 3',
  'Chorus 4',
  'Refrain',
  'Bridge 3',
  'Transition',
  'Interlude Solo',
  'Verse 6',
  'Verse 7',
  'Pre-Chorus A',
  'Pre-Chorus B',
  'Pre-Verse',
  'Link',
  'Solo Part 1',
  'Solo Part 2',
  'Fill',
  'Intro 1',
  'Intro 2',
  'Riff',
  'Interlude 1',
  'Interlude 2',
  'Riff/Instrumental',
  'Coda',
  'Capo',
  'Instrumental Fill',
  'Solo Chords',
  'Riff 1',
  'Riff 2',
  'Riff 1 cont.',
  'Break 1',
  'Break 2',
  'Break',
  'Chords',
  'Chorus 5',
  'Chorus 6',
  'Chorus 7',
  'Chorus 8',
  'Pre Chorus',
  'Verse I',
  'Verse II',
  'Verse III',
  'Verse IV',
];

// Source + flags for the `titles` regex (legacy pageScraper.js line 235).
export const TITLES_SOURCE =
  '(Chorus|Verse|Verse 1|Verse 2|Intro|Pre-chorus|Interlude|Bridge|Intro Tab|Instrumental|Outro|Solo|Post-Chorus|Bridge 1|Bridge 2|Chorus 1|Chorus 2|Verse 3|Verse 4|Verse 5|Outro Solo|Harmonies|Coda|Pre-Chorus|Chorus 3|Chorus 4|Refrain|Bridge 3|Transition|Interlude Solo|Verse 6|Verse 7|Pre-Chorus A|Pre-Chorus B|Pre-Verse|Link|Solo Part 1|Solo Part 2|Fill|Intro 1|Intro 2|Riff|Riff 1|Riff 2|Interlude 1|Interlude 2|Chorus\\/Outro|Riff\\/Instrumental|Capo|Instrumental Fill|Solo Chords|Riff 1|Riff 2|Riff 1 cont.|Break 1|Break 2|Break|Chorus 5|Chorus 6|Chorus 7|Chorus 8|Pre Chorus|Verse I|Verse II|Verse III|Verse IV)';
export const TITLES_FLAGS = 'gi';

// Source + flags for the `chords` regex (legacy pageScraper.js lines 236-237).
export const CHORDS_SOURCE =
  '[A-G][#b]?\\d?(m|maj|dim|aug|sus|add|mmaj)?\\d?(\\/[A-G][#b]?\\d?)?\\*?\\*?\\*?(\\s+[A-G][#b]?\\d?(m|maj|dim|aug|sus|add|mmaj)?\\d?(\\/[A-G][#b]?\\d?)?\\*?\\*?\\*?)*(?:\\s+slide)?(?:\\s+N.C.)?(?:\\s+x\\d\\d?\\d?\\d?\\d?\\d?)?(?:|)?(?:\\:)?';
export const CHORDS_FLAGS = 'g';

// The literal placeholder strings in the Google Docs template. EXACT — do not change.
export const TITLE_PLACEHOLDER = 'Song Title - Artist Name';
export const COL2_PLACEHOLDER = 'col2';
