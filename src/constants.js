// Template placeholder strings for the Google Docs template. EXACT — do not change
// without updating the template document to match.
//
// The template is a 1×2 table: the left cell holds the `col1` placeholder, the
// right cell holds `col2`, and the song-title placeholder lives in the document
// header. The formatter replaces all three (src/formatter.js). Line classification
// for bold/lyric decisions lives in src/detect.js (classifyLine), reused by the
// layout engine — there are no chord/section regexes here anymore.
export const TITLE_PLACEHOLDER = 'Song Title - Artist Name';
export const COL1_PLACEHOLDER = 'col1';
export const COL2_PLACEHOLDER = 'col2';
