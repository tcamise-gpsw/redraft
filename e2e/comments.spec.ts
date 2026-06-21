import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4990',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('comment flow selects text, opens the form, and writes a sidecar file', async ({ page }) => {
  let commentsFile: string | null = null;

  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const decodedUrl = decodeURIComponent(url);
    const method = route.request().method();

    if (url.endsWith('/user')) {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ login: 'jdoe', avatar_url: 'https://example.com/avatar.png' }) });
      return;
    }

    if (url.includes('/git/trees/')) {
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ tree: [{ path: 'proposals/camera-session.md', type: 'blob' }] }) });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.comments.json') && method === 'GET') {
      if (!commentsFile) {
        await route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Not Found' }) });
        return;
      }

      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ type: 'file', sha: 'comments-sha', content: Buffer.from(commentsFile).toString('base64') }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.comments.json') && method === 'PUT') {
      const body = JSON.parse(route.request().postData() ?? '{}');
      commentsFile = Buffer.from(body.content, 'base64').toString('utf8');
      await route.fulfill({
        status: 201,
        headers,
        body: JSON.stringify({ content: { sha: 'comments-sha' } }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.md') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'doc-sha',
          content: Buffer.from('# Camera Session\n\nThe camera should initialize lazily when preview starts.').toString('base64'),
        }),
      });
      return;
    }

    if (url.includes('/commits')) {
      await route.fulfill({ status: 200, headers, body: JSON.stringify([]) });
      return;
    }

    await route.fulfill({ status: 200, headers, body: JSON.stringify({}) });
  });

  await page.goto('/');
  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByLabel('Repository').fill('acme/workspace');
  await page.getByRole('button', { name: 'Connect' }).click();
  await page.getByRole('link', { name: 'camera-session.md' }).click();

  await page.locator('#document-markdown-root p').evaluate((paragraph) => {
    const range = document.createRange();
    const textNode = paragraph.firstChild as Text;
    const start = textNode.textContent!.indexOf('initialize lazily');
    range.setStart(textNode, start);
    range.setEnd(textNode, start + 'initialize lazily'.length);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
  });

  await page.getByRole('button', { name: 'Comment' }).click();
  await page.getByLabel('Comment body').fill('Question');
  await page.getByRole('button', { name: 'Submit comment' }).click();

  await expect(page.getByText('Question')).toBeVisible();
});
