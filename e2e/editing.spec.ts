import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4990',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('edit flow saves markdown and conflict handling shows a toast', async ({ page }) => {
  let content = '# Camera Session\n\nThe camera should initialize lazily.';
  let sha = 'doc-sha';
  let conflict = false;

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

    if (decodedUrl.includes('/contents/proposals/camera-session.comments.json')) {
      await route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Not Found' }) });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.md') && method === 'GET') {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ type: 'file', sha, content: Buffer.from(content).toString('base64') }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.md') && method === 'PUT') {
      if (conflict) {
        await route.fulfill({ status: 422, headers, body: JSON.stringify({ message: 'sha does not match' }) });
        return;
      }

      const body = JSON.parse(route.request().postData() ?? '{}');
      content = Buffer.from(body.content, 'base64').toString('utf8');
      sha = 'doc-sha-2';
      await route.fulfill({ status: 200, headers, body: JSON.stringify({ content: { sha } }) });
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
  await page.getByRole('link', { name: 'Edit' }).click();

  await page.getByLabel('Markdown editor').fill('# Camera Session\n\nUpdated content');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Proposal saved')).toBeVisible();
  await expect(page.getByText('Updated content')).toBeVisible();

  conflict = true;
  await page.getByRole('link', { name: 'Edit' }).click();
  await page.getByLabel('Markdown editor').fill('# Camera Session\n\nConflict content');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText(/refresh and re-apply/i)).toBeVisible();
});
