import { jest } from '@jest/globals';

// Mock the Google client so we can assert the *call shape* without the network.
// This guards the gaxios contract: `timeout` must be the 2nd (options) argument —
// putting it in the params object sends it as a query param and Google 400s.
const copy = jest.fn(() => Promise.resolve({ data: { id: 'doc-123' } }));
const batchUpdate = jest.fn(() =>
  Promise.resolve({
    data: {
      replies: [
        { replaceAllText: { occurrencesChanged: 1 } },
        { replaceAllText: { occurrencesChanged: 1 } },
        { replaceAllText: { occurrencesChanged: 1 } },
      ],
    },
  })
);
const get = jest.fn(() =>
  Promise.resolve({
    data: {
      body: {
        content: [
          {},
          {},
          { table: { tableRows: [{ tableCells: [{ content: [] }, { content: [] }] }] } },
        ],
      },
    },
  })
);

jest.unstable_mockModule('googleapis', () => ({
  google: {
    drive: () => ({ files: { copy } }),
    docs: () => ({ documents: { batchUpdate, get } }),
  },
}));

const { createSongDoc } = await import('../src/google/docs.js');

describe('createSongDoc — Google API call shape', () => {
  beforeEach(() => {
    copy.mockClear();
    batchUpdate.mockClear();
    get.mockClear();
  });

  it('passes timeout as the options arg (not a query param) and returns the doc URL', async () => {
    const result = await createSongDoc(
      {},
      { title: 'Wonderwall', artist: 'Oasis', rawText: '[Verse 1]\nEm  G\nhello there' }
    );

    expect(result.docUrl).toContain('doc-123');

    // copy(params, options) — timeout in options, NOT in params.
    const [copyParams, copyOptions] = copy.mock.calls[0];
    expect(copyParams.timeout).toBeUndefined();
    expect(copyOptions.timeout).toEqual(expect.any(Number));

    // pass 1 + pass 2 batchUpdate, and the get, all follow the same contract.
    for (const fn of [batchUpdate, get]) {
      for (const call of fn.mock.calls) {
        expect(call[0].timeout).toBeUndefined();
        expect(call[1].timeout).toEqual(expect.any(Number));
      }
    }
  });

  it('throws when the Drive copy returns no document id', async () => {
    copy.mockResolvedValueOnce({ data: {} });
    await expect(
      createSongDoc({}, { title: 'T', artist: 'A', rawText: '[Verse 1]\nG\nx' })
    ).rejects.toThrow(/did not return a document id/);
  });
});
