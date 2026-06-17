// Google Drive + Docs operations: copy the template, run the formatter's
// batchUpdate, then re-read the doc and run the unbold second pass. Fully
// awaited (no callback-style API calls).

import { google } from 'googleapis';
import { config } from '../config.js';
import { createFormatter } from '../formatter.js';
import { buildDocTitle } from '../scraper.js';

/**
 * Build the editable Google Docs URL for a document id.
 * @param {string} id - the document id
 * @returns {string} the doc URL
 */
const docUrl = (id) => `https://docs.google.com/document/d/${id}/edit`;

// Fields for the second pass: just the column-2 table cell paragraph elements.
const CELL_FIELDS =
  'body(content(table(tableRows(tableCells(content(paragraph(elements(endIndex,startIndex,textRun/content))))))))';

/**
 * Pull a table-cell content array (by column index) out of a fetched doc.
 * @param {object} doc - the documents.get response data
 * @param {number} col - 0 for the left cell, 1 for the right cell
 * @returns {object[]|null} the cell content array, or null if not found
 */
function getCellContent(doc, col) {
  return doc?.body?.content?.[2]?.table?.tableRows?.[0]?.tableCells?.[col]?.content ?? null;
}

/**
 * Warn (don't fail silently) if a placeholder replacement matched nothing — the
 * template is likely missing that placeholder. `replies` is the batchUpdate
 * response, in request order: [title, col1, col2].
 * @param {object[]} replies - batchUpdate response replies
 * @param {string} documentId - for the log message
 * @returns {void}
 */
function warnOnMissingPlaceholders(replies, documentId) {
  const labels = ['title', 'col1', 'col2'];
  labels.forEach((label, i) => {
    const changed = replies?.[i]?.replaceAllText?.occurrencesChanged ?? 0;
    if (!changed) {
      console.warn(
        `[docs] placeholder "${label}" matched nothing in ${documentId} — ` +
          'the template may be missing it (see docs/RASPBERRY_PI.md template setup).'
      );
    }
  });
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

  // 2. Pass 1: replace the title + both column placeholders with the rendered text.
  const { data: replaceResult } = await docs.documents.batchUpdate({
    documentId,
    requestBody: { requests: formatter.buildReplaceRequests() },
  });
  warnOnMissingPlaceholders(replaceResult.replies, documentId);

  // 3. Pass 2: re-read both cells and bold each paragraph by its rendered kind.
  const { data: doc } = await docs.documents.get({ documentId, fields: CELL_FIELDS });
  const styleRequests = formatter.buildStyleRequests(
    getCellContent(doc, 0),
    getCellContent(doc, 1)
  );
  if (styleRequests.length > 0) {
    await docs.documents.batchUpdate({ documentId, requestBody: { requests: styleRequests } });
  }

  return { documentId, docUrl: docUrl(documentId), title: song.title, artist: song.artist };
}
