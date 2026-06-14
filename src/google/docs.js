// Google Drive + Docs operations: copy the template, run the formatter's
// batchUpdate, then re-read the doc and run the unbold second pass. Fully
// awaited (no callback-style API calls).

import { google } from 'googleapis';
import { config } from '../config.js';
import { createFormatter } from '../formatter.js';
import { buildDocTitle } from '../scraper.js';

const DOC_URL = (id) => `https://docs.google.com/document/d/${id}/edit`;

// Fields for the second pass: just the column-2 table cell paragraph elements.
const CELL_FIELDS =
  'body(content(table(tableRows(tableCells(content(paragraph(elements(endIndex,startIndex,textRun/content))))))))';

// Pull the column-2 cell content array out of the doc, defensively.
function getColumn2Content(doc) {
  return doc?.body?.content?.[2]?.table?.tableRows?.[0]?.tableCells?.[1]?.content ?? null;
}

/**
 * Create a formatted Google Doc for a scraped song.
 * @param {import('google-auth-library').OAuth2Client} authClient
 * @param {{ title: string, artist: string, rawText: string }} song
 * @returns {Promise<{ documentId: string, docUrl: string, title: string, artist: string }>}
 */
export async function createSongDoc(authClient, song) {
  const drive = google.drive({ version: 'v3', auth: authClient });
  const docs = google.docs({ version: 'v1', auth: authClient });

  const docTitle = buildDocTitle(song.title, song.artist);
  const formatter = createFormatter({ rawText: song.rawText, title: docTitle });
  const requests = formatter.buildBatchRequests();

  // 1. Copy the template (awaited promise form, optionally into a folder).
  const copyBody = { name: docTitle };
  if (config.driveFolderId) {
    copyBody.parents = [config.driveFolderId];
  }
  const copy = await drive.files.copy({ fileId: config.templateDocId, requestBody: copyBody });
  const documentId = copy.data.id;
  if (!documentId) {
    throw new Error('Drive copy did not return a document id');
  }

  // 2. Insert the formatted column-1 text + column-2 replacement + title.
  await docs.documents.batchUpdate({ documentId, requestBody: { requests } });

  // 3. Second pass: re-read the doc and unbold the lyric lines in column 2.
  const { data: doc } = await docs.documents.get({ documentId, fields: CELL_FIELDS });
  const cellContent = getColumn2Content(doc);
  if (cellContent) {
    const unboldRequests = formatter.buildUnboldRequests(cellContent);
    if (unboldRequests.length > 0) {
      await docs.documents.batchUpdate({ documentId, requestBody: { requests: unboldRequests } });
    }
  } else {
    console.warn(
      `Could not locate column-2 table cell in ${documentId} — skipping unbold pass. ` +
        'The template layout may have changed.'
    );
  }

  return { documentId, docUrl: DOC_URL(documentId), title: song.title, artist: song.artist };
}
