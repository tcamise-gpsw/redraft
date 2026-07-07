import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4990',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('editing flows save markdown and conflict handling shows a toast', async ({
  page,
}) => {
  let content = '# Camera Session\n\nThe camera should initialize lazily.';
  let sha = 'doc-sha';
  let conflict = false;

  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const decodedUrl = decodeURIComponent(url);
    const method = route.request().method();

    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          login: 'jdoe',
          avatar_url: 'https://example.com/avatar.png',
        }),
      });
      return;
    }

    if (url.endsWith('/repos/acme/workspace')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ default_branch: 'main' }),
      });
      return;
    }

    if (url.includes('/branches')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify([{ name: 'main' }, { name: 'redraft' }]),
      });
      return;
    }

    if (url.includes('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          tree: [{ path: 'camera-session.md', type: 'blob' }],
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/main/camera-session.comments.json',
      )
    ) {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (
      decodedUrl.includes('/contents/camera-session.md') &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha,
          content: Buffer.from(content, 'utf8').toString('base64'),
        }),
      });
      return;
    }

    if (
      decodedUrl.includes('/contents/camera-session.md') &&
      method === 'PUT'
    ) {
      if (conflict) {
        await route.fulfill({
          status: 422,
          headers,
          body: JSON.stringify({ message: 'GitHub content SHA conflict' }),
        });
        return;
      }

      const payload = JSON.parse(route.request().postData() ?? '{}') as {
        content: string;
      };
      content = Buffer.from(payload.content, 'base64').toString('utf8');
      sha = 'updated-sha';
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          content: { sha },
        }),
      });
      return;
    }

    if (url.includes('/commits')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({ status: 200, headers, body: JSON.stringify({}) });
  });

  await page.goto('/');
  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByLabel('Repository').fill('acme/workspace');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('link', { name: 'camera-session.md' }).click();

  await page.getByRole('button', { name: 'WYSIWYG' }).click();
  const editable = page.locator('.ProseMirror[contenteditable="true"]').first();
  await expect(editable).toBeVisible();

  await editable.evaluate((root) => {
    const paragraphs = Array.from(root.querySelectorAll('p'));
    const lastParagraph = paragraphs[paragraphs.length - 1];
    if (!(lastParagraph instanceof HTMLElement)) {
      return;
    }

    const textNode = lastParagraph.firstChild;
    if (!(textNode instanceof Text)) {
      return;
    }

    const range = document.createRange();
    const endOffset = textNode.textContent?.length ?? 0;
    range.setStart(textNode, endOffset);
    range.setEnd(textNode, endOffset);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    root.focus();
  });
  await page.keyboard.type(' Updated in WYSIWYG');
  await expect(editable).toBeVisible();

  await page.getByRole('button', { name: 'Raw' }).click();
  await page
    .getByLabel('Markdown editor')
    .fill('# Camera Session\n\nSaved from raw mode');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Document saved')).toBeVisible();
  await expect(content).toContain('Saved from raw mode');

  conflict = true;
  await page.getByRole('button', { name: 'Raw' }).click();
  await page
    .getByLabel('Markdown editor')
    .fill('# Camera Session\n\nConflict content');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/refresh and re-apply/i)).toBeVisible();
});
