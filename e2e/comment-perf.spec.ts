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
