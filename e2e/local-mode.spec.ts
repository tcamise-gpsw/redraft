import { expect, test } from '@playwright/test';
import { readFile, rm, writeFile } from 'node:fs/promises';

const LOCAL_PROPOSALS_ROOT = '/tmp/redraft-local-playwright';

test('local mode auto-authenticates and renders proposal content', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('button', { name: 'Connect' })).toHaveCount(0);
  await expect(page.getByText('api-design-v2.md')).toBeVisible();
  await page.getByRole('link', { name: /auth-overhaul.md/ }).click();
  await expect(
    page.getByRole('heading', { name: 'Authentication Overhaul Proposal' }),
  ).toBeVisible();
});

test('local mode writes markdown edits back to disk and reflects external file changes', async ({ page }) => {
  const proposalPath = `${LOCAL_PROPOSALS_ROOT}/auth-overhaul.md`;
  const original = await readFile(proposalPath, 'utf8');

  try {
    await page.goto('/');
    await page.getByRole('link', { name: /auth-overhaul.md/ }).click();
    await page.getByRole('button', { name: 'Raw' }).click();
    await page
      .getByLabel('Markdown editor')
      .fill('# Authentication Overhaul Proposal\n\nSaved from local mode');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Proposal saved')).toBeVisible();
    await expect(readFile(proposalPath, 'utf8')).resolves.toContain(
      'Saved from local mode',
    );

    await writeFile(
      proposalPath,
      '# Authentication Overhaul Proposal\n\nChanged outside the UI\n',
      'utf8',
    );
    await expect(page.getByText('Changed outside the UI')).toBeVisible();
  } finally {
    await writeFile(proposalPath, original, 'utf8');
  }
});

test('local mode writes saved comment threads back to disk', async ({ page }) => {
  const commentPath = `${LOCAL_PROPOSALS_ROOT}/auth-overhaul.comments.json`;
  const originalComments = await readFile(commentPath, 'utf8').catch(() => null);

  try {
    await rm(commentPath, { force: true });
    await page.goto('/');
    await page.getByRole('link', { name: /auth-overhaul.md/ }).click();

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
      .poll(async () => readFile(commentPath, 'utf8').catch(() => ''))
      .toContain('Question from local mode');
  } finally {
    if (originalComments === null) {
      await rm(commentPath, { force: true });
    } else {
      await writeFile(commentPath, originalComments, 'utf8');
    }
  }
});

test('local mode updates the proposal tree when files are created on disk', async ({ page }) => {
  const proposalPath = `${LOCAL_PROPOSALS_ROOT}/playwright-local.md`;

  await page.goto('/');
  await writeFile(
    proposalPath,
    '# Playwright Local\n\nCreated by the E2E test.\n',
    'utf8',
  );

  try {
    await expect(
      page.getByRole('link', { name: /playwright-local.md/ }),
    ).toBeVisible();
  } finally {
    await rm(proposalPath, { force: true });
  }
});
