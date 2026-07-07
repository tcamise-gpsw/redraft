import { expect, test } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';

const LOCAL_WORKSPACE_ROOT = '/tmp/redraft-local-playwright';
const AUTH_DOC_PATH = `${LOCAL_WORKSPACE_ROOT}/docs/auth-overhaul.md`;
const AUTH_COMMENT_PATH = `${LOCAL_WORKSPACE_ROOT}/.redraft/comments/main/docs/auth-overhaul.comments.json`;

test('local mode auto-authenticates and renders the split document tree', async ({
  page,
}) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  await expect(
    page.getByRole('heading', { name: 'Under Review' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /api-design-v2.md/ }).first(),
  ).toBeVisible();

  // Subdirectories are collapsed by default — expand `docs` to reveal the nested file.
  await page.getByRole('button', { name: 'docs', exact: true }).click();
  await expect(page.getByText('auth-overhaul.md')).toBeVisible();
  await page.getByRole('link', { name: 'auth-overhaul.md' }).click();
  await expect(
    page.getByRole('heading', { name: 'Authentication Overhaul Proposal' }),
  ).toBeVisible();
});

test('local mode writes markdown edits back to disk and reflects external file changes', async ({
  page,
}) => {
  test.setTimeout(45_000);
  const original = await readFile(AUTH_DOC_PATH, 'utf8');

  try {
    await page.goto('/');
    // Subdirectories are collapsed by default — expand `docs` before opening the nested file.
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page.getByRole('link', { name: 'auth-overhaul.md' }).click();
    await page.getByRole('button', { name: 'Raw' }).click();
    await page
      .getByLabel('Markdown editor')
      .fill('# Authentication Overhaul Proposal\n\nSaved from local mode');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Document saved')).toBeVisible();
    await expect(readFile(AUTH_DOC_PATH, 'utf8')).resolves.toContain(
      'Saved from local mode',
    );

    // Saving switches back to View mode. Wait for the saved content to render
    // (and its watcher/WebSocket refetch cycle to drain) BEFORE writing the
    // external change, so the two propagation cycles don't overlap and race.
    await expect(page.locator('.ProseMirror')).toContainText(
      'Saved from local mode',
    );

    await writeFile(
      AUTH_DOC_PATH,
      '# Authentication Overhaul Proposal\n\nChanged outside the UI\n',
      'utf8',
    );
    // Cross-process propagation (fs watcher -> WebSocket -> query invalidation ->
    // Milkdown re-render) can exceed the 5s default; allow more headroom.
    await expect(page.getByText('Changed outside the UI')).toBeVisible({
      timeout: 30_000,
    });
  } finally {
    await writeFile(AUTH_DOC_PATH, original, 'utf8');
  }
});

test('local mode writes saved comment threads to .redraft/comments', async ({
  page,
}) => {
  const originalComments = await readFile(AUTH_COMMENT_PATH, 'utf8').catch(
    () => null,
  );

  try {
    await rm(AUTH_COMMENT_PATH, { force: true });
    await page.goto('/');
    // Subdirectories are collapsed by default — expand `docs` before opening the nested file.
    await page.getByRole('button', { name: 'docs', exact: true }).click();
    await page.getByRole('link', { name: 'auth-overhaul.md' }).click();

    await page.locator('.ProseMirror').evaluate((root) => {
      const paragraph = root.querySelector('p');
      if (!(paragraph instanceof HTMLElement)) {
        return;
      }

      const textNode = paragraph.firstChild;
      if (!(textNode instanceof Text)) {
        return;
      }

      const text = textNode.textContent ?? '';
      const quote = 'current session-cookie authentication';
      const start = text.indexOf(quote);
      if (start < 0) {
        return;
      }

      const range = document.createRange();
      range.setStart(textNode, start);
      range.setEnd(textNode, start + quote.length);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      root.focus();
      document.dispatchEvent(new Event('selectionchange'));
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    });

    await expect(page.getByRole('button', { name: 'Comment' })).toBeVisible();
    await page.getByRole('button', { name: 'Comment' }).click();
    await page.getByLabel('Comment body').fill('Question from local mode');
    await page.getByRole('button', { name: 'Submit comment' }).click();
    await expect(page.getByText('Unsaved comment changes')).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect(page.getByText('Question from local mode')).toBeVisible();
    await expect
      .poll(async () => readFile(AUTH_COMMENT_PATH, 'utf8').catch(() => ''))
      .toContain('Question from local mode');
  } finally {
    if (originalComments === null) {
      await rm(AUTH_COMMENT_PATH, { force: true });
    } else {
      await writeFile(AUTH_COMMENT_PATH, originalComments, 'utf8');
    }
  }
});

test('local mode updates the documents tree and under-review section when files change on disk', async ({
  page,
}) => {
  const documentPath = `${LOCAL_WORKSPACE_ROOT}/playwright-local.md`;
  const commentPath = `${LOCAL_WORKSPACE_ROOT}/.redraft/comments/main/playwright-local.comments.json`;

  await page.goto('/');
  await writeFile(
    documentPath,
    '# Playwright Local\n\nCreated by the E2E test.\n',
    'utf8',
  );

  try {
    // fs watcher -> WebSocket -> tree query invalidation can exceed the 5s default.
    await expect(page.getByText('playwright-local.md')).toBeVisible({
      timeout: 15_000,
    });

    await writeFile(commentPath, '{"version":1,"comments":[]}', 'utf8');

    await expect(
      page.getByRole('link', { name: /playwright-local.md/ }),
    ).toBeVisible();
  } finally {
    await rm(documentPath, { force: true });
    await rm(commentPath, { force: true });
  }
});
