interface QuoteContext {
  prefix: string;
  suffix: string;
}

interface AnchorInput {
  quote: string;
  quoteContext: QuoteContext;
  offset: number;
}

export interface AnchorResult {
  status: 'exact' | 'context' | 'orphaned';
  startIndex: number;
  endIndex: number;
  matchedText: string;
}

function orphaned(): AnchorResult {
  return {
    status: 'orphaned',
    startIndex: -1,
    endIndex: -1,
    matchedText: '',
  };
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function scoreContext(
  documentText: string,
  startIndex: number,
  quoteLength: number,
  context: QuoteContext,
): number {
  let score = 0;

  if (context.prefix) {
    const actualPrefix = documentText.slice(
      Math.max(0, startIndex - context.prefix.length),
      startIndex,
    );
    if (
      normalizeWhitespace(actualPrefix) === normalizeWhitespace(context.prefix)
    ) {
      score += 1;
    }
  }

  if (context.suffix) {
    const actualSuffix = documentText.slice(
      startIndex + quoteLength,
      startIndex + quoteLength + context.suffix.length,
    );
    if (
      normalizeWhitespace(actualSuffix) === normalizeWhitespace(context.suffix)
    ) {
      score += 1;
    }
  }

  return score;
}

function findExactOccurrences(documentText: string, quote: string): number[] {
  const positions: number[] = [];
  let offset = documentText.indexOf(quote);

  while (offset >= 0) {
    positions.push(offset);
    offset = documentText.indexOf(quote, offset + 1);
  }

  return positions;
}

function resolveByOffset(
  documentText: string,
  anchor: AnchorInput,
): AnchorResult | null {
  if (anchor.offset < 0 || anchor.offset >= documentText.length) {
    return null;
  }

  const endIndex = anchor.offset + anchor.quote.length;
  if (documentText.slice(anchor.offset, endIndex) !== anchor.quote) {
    return null;
  }

  return {
    status: 'exact',
    startIndex: anchor.offset,
    endIndex,
    matchedText: anchor.quote,
  };
}

function resolveByContext(
  documentText: string,
  anchor: AnchorInput,
): AnchorResult | null {
  const normalizedQuote = normalizeWhitespace(anchor.quote);
  const normalizedPrefix = normalizeWhitespace(anchor.quoteContext.prefix);
  const normalizedSuffix = normalizeWhitespace(anchor.quoteContext.suffix);

  if (!normalizedQuote || !normalizedPrefix || !normalizedSuffix) {
    return null;
  }

  let prefixStart = documentText.indexOf(anchor.quoteContext.prefix);

  while (prefixStart >= 0) {
    const candidateStart = prefixStart + anchor.quoteContext.prefix.length;
    const suffixStart = documentText.indexOf(
      anchor.quoteContext.suffix,
      candidateStart,
    );

    if (suffixStart === -1) {
      return null;
    }

    if (suffixStart > candidateStart) {
      const candidate = documentText.slice(candidateStart, suffixStart);
      if (normalizeWhitespace(candidate) === normalizedQuote) {
        return {
          status: 'context',
          startIndex: candidateStart,
          endIndex: suffixStart,
          matchedText: candidate,
        };
      }
    }

    prefixStart = documentText.indexOf(
      anchor.quoteContext.prefix,
      prefixStart + anchor.quoteContext.prefix.length,
    );
  }

  return null;
}

export function resolveAnchor(
  documentText: string,
  anchor: AnchorInput,
): AnchorResult {
  if (!documentText || !anchor.quote) {
    return orphaned();
  }

  const offsetMatch = resolveByOffset(documentText, anchor);
  if (offsetMatch) {
    return offsetMatch;
  }

  const occurrences = findExactOccurrences(documentText, anchor.quote);

  if (occurrences.length > 1) {
    const ranked = occurrences
      .map((startIndex) => ({
        startIndex,
        score: scoreContext(
          documentText,
          startIndex,
          anchor.quote.length,
          anchor.quoteContext,
        ),
      }))
      .sort(
        (left, right) =>
          right.score - left.score || left.startIndex - right.startIndex,
      );

    const best = ranked[0];
    if (best) {
      return {
        status: 'exact',
        startIndex: best.startIndex,
        endIndex: best.startIndex + anchor.quote.length,
        matchedText: anchor.quote,
      };
    }
  }

  if (occurrences.length === 1) {
    const [startIndex] = occurrences;
    const rawPrefix = documentText.slice(
      Math.max(0, startIndex - anchor.quoteContext.prefix.length),
      startIndex,
    );
    const rawSuffix = documentText.slice(
      startIndex + anchor.quote.length,
      startIndex + anchor.quote.length + anchor.quoteContext.suffix.length,
    );

    if (
      (anchor.quoteContext.prefix &&
        rawPrefix !== anchor.quoteContext.prefix &&
        normalizeWhitespace(rawPrefix) ===
          normalizeWhitespace(anchor.quoteContext.prefix)) ||
      (anchor.quoteContext.suffix &&
        rawSuffix !== anchor.quoteContext.suffix &&
        normalizeWhitespace(rawSuffix) ===
          normalizeWhitespace(anchor.quoteContext.suffix))
    ) {
      return {
        status: 'context',
        startIndex,
        endIndex: startIndex + anchor.quote.length,
        matchedText: anchor.quote,
      };
    }

    return {
      status: 'exact',
      startIndex,
      endIndex: startIndex + anchor.quote.length,
      matchedText: anchor.quote,
    };
  }

  return resolveByContext(documentText, anchor) ?? orphaned();
}
