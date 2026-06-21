import { describe, expect, it } from 'vitest';

import { createAnchor, resolveAnchor } from '../anchoring';

describe('comment anchoring', () => {
  it('finds an exact quote at the correct position', () => {
    const documentText = 'The camera should initialize lazily when preview starts.';

    expect(
      resolveAnchor(documentText, {
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
      }),
    ).toEqual({
      status: 'exact',
      startIndex: 18,
      endIndex: 35,
      matchedText: 'initialize lazily',
    });
  });

  it('uses surrounding context to disambiguate identical quotes', () => {
    const documentText =
      'Alpha starts fast. The camera should initialize lazily. Later, Beta also initialize lazily after login.';

    expect(
      resolveAnchor(documentText, {
        quote: 'initialize lazily',
        quoteContext: {
          prefix: 'Beta also ',
          suffix: ' after login.',
        },
      }),
    ).toEqual({
      status: 'exact',
      startIndex: 73,
      endIndex: 90,
      matchedText: 'initialize lazily',
    });
  });

  it('finds a context match when nearby whitespace changed', () => {
    const documentText = 'For performance reasons, initialize lazily when the preview opens.';

    expect(
      resolveAnchor(documentText, {
        quote: 'initialize lazily',
        quoteContext: {
          prefix: 'For performance reasons,  ',
          suffix: '   when the preview opens.',
        },
      }),
    ).toEqual({
      status: 'context',
      startIndex: 25,
      endIndex: 42,
      matchedText: 'initialize lazily',
    });
  });

  it('finds a fuzzy match when the quote was lightly edited', () => {
    const documentText = 'The camera should initialize more lazily during preview startup.';

    const result = resolveAnchor(documentText, {
      quote: 'initialize lazily',
      quoteContext: { prefix: 'The camera should ', suffix: ' during preview startup.' },
    });

    expect(result.status).toBe('fuzzy');
    expect(result.matchedText).toBe('initialize more lazily');
    expect(result.startIndex).toBe(18);
    expect(result.endIndex).toBe(40);
  });

  it('returns orphaned when no candidate meets the threshold', () => {
    expect(
      resolveAnchor('Completely different text.', {
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
      }),
    ).toEqual({
      status: 'orphaned',
      startIndex: -1,
      endIndex: -1,
      matchedText: '',
    });
  });

  it('creates an anchor with trimmed word-boundary context', () => {
    const documentText =
      'The camera should initialize lazily when preview starts so the rest of the pipeline can remain idle.';
    const startIndex = documentText.indexOf('initialize lazily');

    expect(createAnchor(documentText, 'initialize lazily', startIndex)).toEqual({
      quote: 'initialize lazily',
      quoteContext: {
        prefix: 'The camera should ',
        suffix: ' when preview starts so the rest of the pipeline can remain idle.',
      },
    });
  });

  it('handles empty inputs, line breaks, and long quotes', () => {
    expect(
      resolveAnchor('', {
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
      }),
    ).toEqual({
      status: 'orphaned',
      startIndex: -1,
      endIndex: -1,
      matchedText: '',
    });

    const multiline = 'Alpha\ninitialize lazily\nBeta';
    expect(
      resolveAnchor(multiline, {
        quote: 'initialize lazily',
        quoteContext: { prefix: 'Alpha\n', suffix: '\nBeta' },
      }),
    ).toEqual({
      status: 'exact',
      startIndex: 6,
      endIndex: 23,
      matchedText: 'initialize lazily',
    });

    const longQuote = 'x'.repeat(600);
    const longDocument = `before ${longQuote} after`;
    expect(
      resolveAnchor(longDocument, {
        quote: longQuote,
        quoteContext: { prefix: 'before ', suffix: ' after' },
      }),
    ).toEqual({
      status: 'exact',
      startIndex: 7,
      endIndex: 607,
      matchedText: longQuote,
    });
  });
});
