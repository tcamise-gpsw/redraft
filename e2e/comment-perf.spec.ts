import { expect, test } from '@playwright/test';
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
    // The new comment must be anchored — not in the Orphaned section.
    const orphanedSection = page
      .getByText('⚠️ Orphaned comments')
      .locator('xpath=ancestor::section[1]');
    await expect(orphanedSection.getByText(NEW_COMMENT_BODY)).toHaveCount(0);
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
