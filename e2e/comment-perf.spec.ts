import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';

const LOCAL_WORKSPACE_ROOT = '/tmp/redraft-local-playwright';
const LARGE_DOC_COMMENT_PATH = `${LOCAL_WORKSPACE_ROOT}/.redraft/comments/main/docs/platform-architecture.comments.json`;

const OFFSET_HIT_BODY = 'Offset hit thread stays anchored';
const EXACT_FALLBACK_BODY = 'Exact fallback thread stays anchored';
const CONTEXT_RELOCATION_BODY = 'Context relocation thread stays anchored';
const ORPHANED_BODY = 'Fully rewritten paragraph is orphaned';
const NEW_COMMENT_BODY = 'New comment saved from comment-perf spec';

test('local mode renders large seeded comment fixtures without freezing and separates orphaned threads', async ({
  page,
}) => {
  test.setTimeout(15_000);

  await page.goto('/');
  await page.getByRole('button', { name: 'docs', exact: true }).click();
  await page
    .getByRole('link', { name: /platform-architecture.md/ })
    .first()
    .click();

  await expect(page.getByText(OFFSET_HIT_BODY)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByText(EXACT_FALLBACK_BODY)).toBeVisible();
  await expect(page.getByText(CONTEXT_RELOCATION_BODY)).toBeVisible();
  await expect
    .poll(async () =>
      page.locator('article[data-testid^="comment-thread-"]').count(),
    )
    .toBeGreaterThanOrEqual(4);

  const orphanedHeading = page.getByText('⚠️ Orphaned comments');
  await expect(orphanedHeading).toBeVisible();
  const orphanedSection = orphanedHeading.locator('xpath=ancestor::section[1]');
  await expect(orphanedSection.getByText(ORPHANED_BODY)).toBeVisible();
  await expect(orphanedSection.getByText(OFFSET_HIT_BODY)).toHaveCount(0);
  await expect(orphanedSection.getByText(EXACT_FALLBACK_BODY)).toHaveCount(0);
  await expect(orphanedSection.getByText(CONTEXT_RELOCATION_BODY)).toHaveCount(
    0,
  );
});

test('local mode saves a new large-document comment with an offset in the sidecar', async ({
  page,
}) => {
  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture.md/ })
      .first()
      .click();

    await page.locator('.ProseMirror').evaluate((root) => {
      const paragraph = Array.from(root.querySelectorAll('p')).find((node) => {
        const text = node.textContent?.trim() ?? '';
        return node.childElementCount === 0 && text.length >= 40;
      });

      if (!(paragraph instanceof HTMLElement)) {
        throw new Error(
          'Expected a plain paragraph with enough text for selection',
        );
      }

      const textNode = paragraph.firstChild;
      if (!(textNode instanceof Text)) {
        throw new Error(
          'Expected the selected paragraph to start with a text node',
        );
      }

      const quoteLength = Math.min(36, textNode.textContent?.length ?? 0);
      if (quoteLength < 20) {
        throw new Error(
          'Expected a paragraph long enough to create a comment selection',
        );
      }

      const range = document.createRange();
      range.setStart(textNode, 0);
      range.setEnd(textNode, quoteLength);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      root.focus();
      document.dispatchEvent(new Event('selectionchange'));
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill(NEW_COMMENT_BODY);
    await page.getByRole('button', { name: 'Submit comment' }).click();
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByText(NEW_COMMENT_BODY)).toBeVisible();
    await expect
      .poll(async () => {
        const raw = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
          () => '',
        );
        if (!raw) {
          return -1;
        }

        const parsed = JSON.parse(raw) as {
          comments?: Array<{ body?: string; offset?: number }>;
        };
        const newThread = parsed.comments?.find(
          (thread) => thread.body === NEW_COMMENT_BODY,
        );
        return typeof newThread?.offset === 'number' ? newThread.offset : -1;
      })
      .toBeGreaterThanOrEqual(0);
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

// ─── shared selector helpers ──────────────────────────────────────────────────

/** Select the innermost section that contains the orphaned-comments heading. */
function orphanedSection(page: Page) {
  return page
    .getByText('⚠️ Orphaned comments')
    .locator('xpath=ancestor::section[1]');
}

/** Select a plain paragraph in the editor and fire a mouseup so the sidebar
 *  picks up the pending selection. Returns the selected quote string. */
async function selectFirstParagraphText(page: Page): Promise<string> {
  return page.locator('.ProseMirror').evaluate((root) => {
    const para = Array.from(root.querySelectorAll('p')).find(
      (p) => p.childElementCount === 0 && (p.textContent?.length ?? 0) >= 30,
    );
    if (!para) throw new Error('No plain paragraph found');
    const tn = para.firstChild;
    if (!(tn instanceof Text))
      throw new Error('Paragraph first child is not Text');
    const len = Math.min(36, tn.textContent?.length ?? 0);
    const range = document.createRange();
    range.setStart(tn, 0);
    range.setEnd(tn, len);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    root.focus();
    document.dispatchEvent(new Event('selectionchange'));
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return tn.textContent?.slice(0, len) ?? '';
  });
}

/**
 * Walk every text node inside the ProseMirror editor and build a DOM Range
 * that covers exactly `quote`. Fires the selectionchange + mouseup events so
 * the sidebar picks up the pending selection.
 *
 * Works correctly for quotes that span across inline marks (bold, italic,
 * inline code, links) because it concatenates raw text node content, which
 * matches what ProseMirror's `doc.textBetween` produces within a single block.
 */
async function selectQuoteInEditor(page: Page, quote: string): Promise<void> {
  const result = await page.locator('.ProseMirror').evaluate((root, q) => {
    const nodes: [Text, number][] = [];
    let pos = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      nodes.push([node, pos]);
      pos += node.textContent?.length ?? 0;
    }

    const fullText = nodes.map(([n]) => n.textContent ?? '').join('');
    const start = fullText.indexOf(q);
    if (start < 0) return { error: `"${q}" not found in rendered text` };
    const end = start + q.length;

    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const [n, nodeStart] of nodes) {
      const nodeEnd = nodeStart + (n.textContent?.length ?? 0);
      if (!startNode && nodeEnd > start) {
        startNode = n;
        startOffset = start - nodeStart;
      }
      if (!endNode && nodeEnd >= end) {
        endNode = n;
        endOffset = end - nodeStart;
        break;
      }
    }

    if (!startNode || !endNode) return { error: 'DOM positions not found' };

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    root.focus();

    // Scroll the start of the selection into the centre of the viewport so
    // ProseMirror's coordsAtPos returns in-viewport coordinates. The Comment
    // button is position:fixed at those coords, so it must be on-screen for
    // Playwright to click it.
    startNode.parentElement?.scrollIntoView({
      block: 'center',
      behavior: 'instant',
    });

    document.dispatchEvent(new Event('selectionchange'));
    root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    return { ok: true };
  }, quote);
  if ('error' in result)
    throw new Error(`selectQuoteInEditor: ${result.error}`);
}

// ─── first write (no pre-existing sidecar) ───────────────────────────────────

const FIRST_WRITE_SIDECAR = `${LOCAL_WORKSPACE_ROOT}/.redraft/comments/main/getting-started.comments.json`;
const FIRST_WRITE_BODY = 'First comment on a doc with no prior sidecar';

test('local mode: first comment on a doc with no sidecar creates the file and anchors correctly', async ({
  page,
}) => {
  test.setTimeout(30_000);

  // Playwright's webServer resets the workspace on every run, so the sidecar
  // genuinely does not exist — this exercises the create-via-PUT path rather
  // than the SHA-based update path in the local server.
  await expect
    .poll(() =>
      readFile(FIRST_WRITE_SIDECAR, 'utf8')
        .then(() => true)
        .catch(() => false),
    )
    .toBe(false);

  await page.goto('/');
  await page.getByRole('link', { name: /getting-started\.md/ }).click();
  await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });

  await selectFirstParagraphText(page);
  await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
  await page.getByRole('button', { name: 'Comment' }).click();
  await page.getByLabel('Comment body').fill(FIRST_WRITE_BODY);
  await page.getByRole('button', { name: 'Submit comment' }).click();

  // Not orphaned immediately after submission.
  await expect(page.getByText(FIRST_WRITE_BODY)).toBeVisible();
  await expect(orphanedSection(page).getByText(FIRST_WRITE_BODY)).toHaveCount(
    0,
  );

  await expect(page.getByText('Unsaved comment changes')).toBeVisible();
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // Sidecar created on disk with a numeric offset — confirms first-write path.
  await expect
    .poll(async () => {
      const raw = await readFile(FIRST_WRITE_SIDECAR, 'utf8').catch(() => '');
      if (!raw) return -1;
      const parsed = JSON.parse(raw) as {
        comments?: Array<{ body?: string; offset?: number }>;
      };
      const thread = parsed.comments?.find((c) => c.body === FIRST_WRITE_BODY);
      return typeof thread?.offset === 'number' ? thread.offset : -1;
    })
    .toBeGreaterThanOrEqual(0);
});

// ─── markdown-formatted selections ───────────────────────────────────────────

// The platform-architecture fixture contains this line (Service Boundary 1):
//   `inline-code-1` appears near [the architecture guide](./architecture.md),
//   and **bold emphasis** plus _italic emphasis_ make sure rendered text
//   differs from markdown source.
//
// The three quotes below do NOT appear verbatim in the raw markdown due to
// surrounding syntax (backticks, asterisks, underscores, link brackets).
// With the renderedText bug (documentText = rawMarkdown), resolveByExact
// would find no substring match and these comments would all orphan.
// With the fix (documentText = rendered plain text), all three anchor.

const BOLD_ITALIC_QUOTE = 'bold emphasis plus italic emphasis';
const BOLD_ITALIC_BODY = 'Comment spanning bold and italic marks';

const INLINE_CODE_QUOTE = 'inline-code-1 appears near the architecture guide';
const INLINE_CODE_BODY = 'Comment spanning inline-code and link text';

const HEADING_QUOTE = 'Service Boundary 1';
const HEADING_BODY =
  'Comment on a heading — offset differs between markdown and rendered';

test('local mode: comment spanning bold + italic marks anchors correctly', async ({
  page,
}) => {
  test.setTimeout(30_000);

  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture\.md/ })
      .first()
      .click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });

    await selectQuoteInEditor(page, BOLD_ITALIC_QUOTE);
    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill(BOLD_ITALIC_BODY);
    await page.getByRole('button', { name: 'Submit comment' }).click();

    await expect(page.getByText(BOLD_ITALIC_BODY)).toBeVisible();
    await expect(orphanedSection(page).getByText(BOLD_ITALIC_BODY)).toHaveCount(
      0,
    );
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

test('local mode: comment spanning inline-code and link text anchors correctly', async ({
  page,
}) => {
  test.setTimeout(30_000);

  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture\.md/ })
      .first()
      .click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });

    await selectQuoteInEditor(page, INLINE_CODE_QUOTE);
    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill(INLINE_CODE_BODY);
    await page.getByRole('button', { name: 'Submit comment' }).click();

    await expect(page.getByText(INLINE_CODE_BODY)).toBeVisible();
    await expect(orphanedSection(page).getByText(INLINE_CODE_BODY)).toHaveCount(
      0,
    );
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

test('local mode: comment on heading text anchors via offset tier (offset differs from raw markdown position)', async ({
  page,
}) => {
  test.setTimeout(30_000);

  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture\.md/ })
      .first()
      .click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });

    await selectQuoteInEditor(page, HEADING_QUOTE);
    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill(HEADING_BODY);
    await page.getByRole('button', { name: 'Submit comment' }).click();

    await expect(page.getByText(HEADING_BODY)).toBeVisible();
    await expect(orphanedSection(page).getByText(HEADING_BODY)).toHaveCount(0);

    // Save and confirm the stored offset is the rendered-text position, not
    // the raw-markdown position. In raw markdown "## Service Boundary 1"
    // the text starts at char 3; in rendered text it is further in.
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    await expect
      .poll(async () => {
        const raw = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
          () => '',
        );
        if (!raw) return null;
        const parsed = JSON.parse(raw) as {
          comments?: Array<{ body?: string; offset?: number }>;
        };
        return (
          parsed.comments?.find((c) => c.body === HEADING_BODY)?.offset ?? null
        );
      })
      // Offset must be > 3 (proves it's NOT the raw-markdown position of the
      // heading after "## "; in rendered space the heading falls much later).
      .toBeGreaterThan(3);
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

// ─── new comment survives navigation ─────────────────────────────────────────

test('local mode: new comment stays anchored after navigating away and back', async ({
  page,
}) => {
  test.setTimeout(45_000);

  const BODY = 'Nav-survival comment from E2E';
  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    // Open the large fixture document.
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture.md/ })
      .first()
      .click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 15_000 });

    // Select text and submit a comment.
    await selectFirstParagraphText(page);
    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill(BODY);
    await page.getByRole('button', { name: 'Submit comment' }).click();
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Confirm the comment is visible and NOT in the orphaned section.
    await expect(page.getByText(BODY)).toBeVisible();
    await expect(orphanedSection(page).getByText(BODY)).toHaveCount(0);

    // Navigate away to a different document.
    await page.getByRole('link', { name: /api-design-v2\.md/ }).click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 10_000 });

    // Navigate back.
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture.md/ })
      .first()
      .click();
    await expect(page.locator('.ProseMirror')).toBeVisible({ timeout: 10_000 });
    // Give the editor time to fire onRenderedText so renderedText = plain text.
    await expect(page.getByText(BODY)).toBeVisible({ timeout: 10_000 });

    // The comment must still be anchored — not moved to the orphaned section.
    // This is the direct regression guard for the useEffect([path]) fix:
    // if renderedText were reset to raw markdown on the content refetch that
    // follows navigation, the offset-based resolver would fail and the comment
    // would appear here.
    await expect(orphanedSection(page).getByText(BODY)).toHaveCount(0);
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

// ─── reply saved to sidecar ───────────────────────────────────────────────────

test('local mode: reply to a seeded thread is saved to the sidecar', async ({
  page,
}) => {
  test.setTimeout(30_000);

  const REPLY_BODY = 'E2E reply to offset-hit thread';
  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture.md/ })
      .first()
      .click();
    await expect(page.getByText(OFFSET_HIT_BODY)).toBeVisible({
      timeout: 10_000,
    });

    // Open the reply form on the first thread.
    await page.getByRole('button', { name: 'Reply' }).first().click();
    await page.getByLabel('Reply').fill(REPLY_BODY);
    await page.getByRole('button', { name: /submit reply/i }).click();

    // Sidebar must show the reply.
    await expect(page.getByText(REPLY_BODY)).toBeVisible();
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // The sidecar on disk must persist the reply nested under the right thread.
    await expect
      .poll(async () => {
        const raw = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
          () => '',
        );
        if (!raw) return false;
        const parsed = JSON.parse(raw) as {
          comments?: Array<{
            body?: string;
            replies?: Array<{ body?: string }>;
          }>;
        };
        const thread = parsed.comments?.find((c) => c.body === OFFSET_HIT_BODY);
        return thread?.replies?.some((r) => r.body === REPLY_BODY) ?? false;
      })
      .toBe(true);
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

// ─── resolve saved to sidecar ─────────────────────────────────────────────────

test('local mode: resolving a thread persists resolved:true to the sidecar', async ({
  page,
}) => {
  test.setTimeout(30_000);

  const originalComments = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await page.goto('/');
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page
      .getByRole('link', { name: /platform-architecture.md/ })
      .first()
      .click();
    await expect(page.getByText(OFFSET_HIT_BODY)).toBeVisible({
      timeout: 10_000,
    });

    // Resolve the first anchored thread.
    await page.getByRole('button', { name: 'Resolve thread' }).first().click();
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save', exact: true }).click();

    // Sidecar on disk must have resolved:true for that thread.
    await expect
      .poll(async () => {
        const raw = await readFile(LARGE_DOC_COMMENT_PATH, 'utf8').catch(
          () => '',
        );
        if (!raw) return false;
        const parsed = JSON.parse(raw) as {
          comments?: Array<{ body?: string; resolved?: boolean }>;
        };
        return (
          parsed.comments?.find((c) => c.body === OFFSET_HIT_BODY)?.resolved ===
          true
        );
      })
      .toBe(true);
  } finally {
    if (originalComments === null) {
      await rm(LARGE_DOC_COMMENT_PATH, { force: true });
    } else {
      await writeFile(LARGE_DOC_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

// ─── context-relocation tier ──────────────────────────────────────────────────

test('local mode: context-relocation tier anchors a comment whose quote has non-standard whitespace in the source', async ({
  page,
}) => {
  // The fixture doc has "relocated    context\nmarker survives" (multiple spaces
  // and a line break) in the raw markdown. The ProseMirror renderer normalises
  // this to a single space, so the stored quote "relocated context marker
  // survives" does not appear verbatim — resolveByExact fails. The context tier
  // (normaliseWhitespace + prefix/suffix search) must pick it up instead.
  test.setTimeout(15_000);

  await page.goto('/');
  await page.getByRole('button', { name: 'docs', exact: true }).click();
  await page
    .getByRole('link', { name: /platform-architecture.md/ })
    .first()
    .click();

  await expect(page.getByText(CONTEXT_RELOCATION_BODY)).toBeVisible({
    timeout: 10_000,
  });

  // Must NOT be in the orphaned section.
  const orphaned = orphanedSection(page);
  await expect(orphaned).toBeVisible();
  await expect(orphaned.getByText(CONTEXT_RELOCATION_BODY)).toHaveCount(0);
});
