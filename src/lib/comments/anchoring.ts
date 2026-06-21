interface QuoteContext {
  prefix: string;
  suffix: string;
}

interface AnchorInput {
  quote: string;
  quoteContext: QuoteContext;
}

export interface AnchorResult {
  status: 'exact' | 'context' | 'fuzzy' | 'orphaned';
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

function longestCommonSubstring(a: string, b: string): string {
  if (!a || !b) {
    return '';
  }

  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));
  let bestLength = 0;
  let bestEnd = 0;

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (a[row - 1] === b[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1;
        if (table[row][col] > bestLength) {
          bestLength = table[row][col];
          bestEnd = row;
        }
      }
    }
  }

  return a.slice(bestEnd - bestLength, bestEnd);
}

function longestCommonSubsequenceLength(a: string, b: string): number {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(cols).fill(0));

  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      if (a[row - 1] === b[col - 1]) {
        table[row][col] = table[row - 1][col - 1] + 1;
      } else {
        table[row][col] = Math.max(table[row - 1][col], table[row][col - 1]);
      }
    }
  }

  return table[a.length][b.length];
}


function similarity(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }

  return Math.max(longestCommonSubstring(a, b).length, longestCommonSubsequenceLength(a, b)) / Math.max(a.length, b.length);
}

function scoreContext(documentText: string, startIndex: number, quoteLength: number, context: QuoteContext): number {
  let score = 0;

  if (context.prefix) {
    const actualPrefix = documentText.slice(Math.max(0, startIndex - context.prefix.length), startIndex);
    if (normalizeWhitespace(actualPrefix) === normalizeWhitespace(context.prefix)) {
      score += 1;
    }
  }

  if (context.suffix) {
    const actualSuffix = documentText.slice(startIndex + quoteLength, startIndex + quoteLength + context.suffix.length);
    if (normalizeWhitespace(actualSuffix) === normalizeWhitespace(context.suffix)) {
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

function findFuzzyCandidate(documentText: string, quote: string, context: QuoteContext): AnchorResult {
  const normalizedPrefix = normalizeWhitespace(context.prefix);
  const normalizedSuffix = normalizeWhitespace(context.suffix);

  if (normalizedPrefix && normalizedSuffix) {
    const prefixStart = documentText.indexOf(normalizedPrefix);
    if (prefixStart >= 0) {
      const suffixSearchStart = prefixStart + normalizedPrefix.length;
      const suffixStart = documentText.indexOf(normalizedSuffix, suffixSearchStart);

      if (suffixStart > suffixSearchStart) {
        const candidate = documentText.slice(suffixSearchStart, suffixStart).trim();
        if (similarity(candidate, quote) >= 0.7) {
          const candidateStart = documentText.indexOf(candidate, suffixSearchStart);
          return {
            status: 'fuzzy',
            startIndex: candidateStart,
            endIndex: candidateStart + candidate.length,
            matchedText: candidate,
          };
        }
      }
    }
  }

  let bestMatch = orphaned();
  let bestScore = 0;
  const minLength = Math.max(1, Math.floor(quote.length * 0.6));
  const maxLength = Math.max(minLength, Math.ceil(quote.length * 1.6));

  for (let start = 0; start < documentText.length; start += 1) {
    for (let length = minLength; length <= maxLength && start + length <= documentText.length; length += 1) {
      const candidate = documentText.slice(start, start + length).trim();
      const score = similarity(candidate, quote);

      if (score > bestScore) {
        bestScore = score;
        bestMatch = {
          status: 'fuzzy',
          startIndex: start,
          endIndex: start + candidate.length,
          matchedText: candidate,
        };
      }
    }
  }

  return bestScore >= 0.7 ? bestMatch : orphaned();
}

export function resolveAnchor(documentText: string, anchor: AnchorInput): AnchorResult {
  if (!documentText || !anchor.quote) {
    return orphaned();
  }

  const occurrences = findExactOccurrences(documentText, anchor.quote);

  if (occurrences.length > 1) {
    const ranked = occurrences
      .map((startIndex) => ({
        startIndex,
        score: scoreContext(documentText, startIndex, anchor.quote.length, anchor.quoteContext),
      }))
      .sort((left, right) => right.score - left.score || left.startIndex - right.startIndex);

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
    const rawPrefix = documentText.slice(Math.max(0, startIndex - anchor.quoteContext.prefix.length), startIndex);
    const rawSuffix = documentText.slice(startIndex + anchor.quote.length, startIndex + anchor.quote.length + anchor.quoteContext.suffix.length);

    if (
      (anchor.quoteContext.prefix && rawPrefix !== anchor.quoteContext.prefix && normalizeWhitespace(rawPrefix) === normalizeWhitespace(anchor.quoteContext.prefix)) ||
      (anchor.quoteContext.suffix && rawSuffix !== anchor.quoteContext.suffix && normalizeWhitespace(rawSuffix) === normalizeWhitespace(anchor.quoteContext.suffix))
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

  return findFuzzyCandidate(documentText, anchor.quote, anchor.quoteContext);
}

export function createAnchor(documentText: string, selectedText: string, selectionStartIndex: number): { quote: string; quoteContext: QuoteContext } {
  const prefixStart = Math.max(0, selectionStartIndex - 100);
  const suffixEnd = Math.min(documentText.length, selectionStartIndex + selectedText.length + 100);
  let prefix = documentText.slice(prefixStart, selectionStartIndex);
  let suffix = documentText.slice(selectionStartIndex + selectedText.length, suffixEnd);

  if (prefixStart > 0) {
    const boundary = prefix.search(/\b/);
    if (boundary > 0) {
      prefix = prefix.slice(boundary);
    }
  }

  if (suffixEnd < documentText.length) {
    const matches = [...suffix.matchAll(/\b/g)];
    const lastBoundary = matches.at(-1)?.index;
    if (typeof lastBoundary === 'number' && lastBoundary > 0) {
      suffix = suffix.slice(0, lastBoundary);
    }
  }

  return {
    quote: selectedText,
    quoteContext: {
      prefix,
      suffix,
    },
  };
}
