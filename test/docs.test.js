import { jest } from '@jest/globals';
import { getCellContent, warnOnMissingPlaceholders } from '../src/google/docs.js';

/** A minimal documents.get shape: a 1×N table at body.content[2]. */
const docWithCells = (cells) => ({
  body: {
    content: [
      {},
      {},
      { table: { tableRows: [{ tableCells: cells.map((content) => ({ content })) }] } },
    ],
  },
});

describe('getCellContent', () => {
  it('returns the content array for the requested column', () => {
    const doc = docWithCells([[{ paragraph: {} }], [{ paragraph: {} }, { paragraph: {} }]]);
    expect(getCellContent(doc, 0)).toHaveLength(1);
    expect(getCellContent(doc, 1)).toHaveLength(2);
  });

  it('returns null when the table or column is missing', () => {
    expect(getCellContent({}, 0)).toBeNull();
    expect(getCellContent(docWithCells([[{}]]), 5)).toBeNull();
    expect(getCellContent(undefined, 0)).toBeNull();
  });
});

describe('warnOnMissingPlaceholders', () => {
  it('warns once per placeholder that matched nothing', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnMissingPlaceholders(
      [
        { replaceAllText: { occurrencesChanged: 1 } }, // title — ok
        { replaceAllText: { occurrencesChanged: 0 } }, // col1 — missing
        {}, // col2 — missing
      ],
      'doc-1'
    );
    expect(spy).toHaveBeenCalledTimes(2);
    spy.mockRestore();
  });

  it('stays silent when every placeholder matched', () => {
    const spy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    warnOnMissingPlaceholders(
      [
        { replaceAllText: { occurrencesChanged: 1 } },
        { replaceAllText: { occurrencesChanged: 1 } },
        { replaceAllText: { occurrencesChanged: 1 } },
      ],
      'doc-1'
    );
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
