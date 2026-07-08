import { describe, expect, it } from 'vitest';

import { resolveAnchor } from '../anchoring';

const ORPHANED_RESULT = {
  status: 'orphaned',
  startIndex: -1,
  endIndex: -1,
  matchedText: '',
} as const;

describe('comment anchoring', () => {
  it('returns an exact match from the stored offset before searching elsewhere', () => {
    const quote = 'initialize lazily';
    const documentText =
      'Alpha path: initialize lazily before boot. Beta path: initialize lazily after login.';
    const firstStart = documentText.indexOf(quote);
    const secondStart = documentText.indexOf(quote, firstStart + 1);

    expect(
      resolveAnchor(documentText, {
        quote,
        quoteContext: { prefix: '', suffix: '' },
        offset: secondStart,
      }),
    ).toEqual({
      status: 'exact',
      startIndex: secondStart,
      endIndex: secondStart + quote.length,
      matchedText: quote,
    });
  });

  it('falls back to exact search when the stored offset no longer points at the quote', () => {
    const quote = 'initialize lazily';
    const documentText =
      'The camera should initialize lazily when preview starts.';
    const startIndex = documentText.indexOf(quote);

    expect(
      resolveAnchor(documentText, {
        quote,
        quoteContext: { prefix: '', suffix: '' },
        offset: 0,
      }),
    ).toEqual({
      status: 'exact',
      startIndex,
      endIndex: startIndex + quote.length,
      matchedText: quote,
    });
  });

  it('ranks multiple exact matches by surrounding context when the offset is unusable', () => {
    const quote = 'initialize lazily';
    const documentText =
      'Alpha path: initialize lazily before boot. Beta path: initialize lazily after login.';
    const startIndex = documentText.lastIndexOf(quote);

    expect(
      resolveAnchor(documentText, {
        quote,
        quoteContext: {
          prefix: 'Beta path: ',
          suffix: ' after login.',
        },
        offset: -1,
      }),
    ).toEqual({
      status: 'exact',
      startIndex,
      endIndex: startIndex + quote.length,
      matchedText: quote,
    });
  });

  it('relocates by normalized context when the quote moved and only whitespace changed', () => {
    const quote = 'review comments carefully';
    const relocatedQuote = 'review   comments\ncarefully';
    const prefix = 'moved prefix ';
    const suffix = ' moved suffix';
    const documentText = `${'intro '.repeat(1500)}${prefix}${relocatedQuote}${suffix}`;
    const startIndex = documentText.indexOf(relocatedQuote);

    expect(
      resolveAnchor(documentText, {
        quote,
        quoteContext: { prefix, suffix },
        offset: 12,
      }),
    ).toEqual({
      status: 'context',
      startIndex,
      endIndex: startIndex + relocatedQuote.length,
      matchedText: relocatedQuote,
    });
  });

  it('returns orphaned when both the quote and its context disappeared', () => {
    expect(
      resolveAnchor(
        'Nothing from the original passage remains in this rewrite.',
        {
          quote: 'review comments carefully',
          quoteContext: {
            prefix: 'moved prefix ',
            suffix: ' moved suffix',
          },
          offset: 24,
        },
      ),
    ).toEqual(ORPHANED_RESULT);
  });

  it('returns orphaned for empty documents and empty quotes', () => {
    expect(
      resolveAnchor('', {
        quote: 'initialize lazily',
        quoteContext: { prefix: '', suffix: '' },
        offset: 0,
      }),
    ).toEqual(ORPHANED_RESULT);

    expect(
      resolveAnchor('The document still exists.', {
        quote: '',
        quoteContext: { prefix: 'The ', suffix: ' exists.' },
        offset: 4,
      }),
    ).toEqual(ORPHANED_RESULT);
  });

  it('stays under 50 ms for a ~50 KB document with no matching quote', () => {
    const documentText = 'abcdefghij '
      .repeat(Math.ceil((50 * 1024) / 11))
      .slice(0, 50 * 1024);
    const startedAt = performance.now();
    const result = resolveAnchor(documentText, {
      quote: 'ΩΩΩΩΩΩΩΩ',
      quoteContext: { prefix: '', suffix: '' },
      offset: Math.floor(documentText.length / 2),
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result).toEqual(ORPHANED_RESULT);
    expect(elapsedMs).toBeLessThan(50);
  }, 1000);
});
