import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4988',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('proposal viewing renders markdown and shows the rate-limit banner', async ({ page }) => {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const decodedUrl = decodeURIComponent(url);

    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ login: 'jdoe', avatar_url: 'https://example.com/avatar.png' }),
      });
      return;
    }

    if (url.includes('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({ tree: [{ path: 'proposals/camera-session.md', type: 'blob' }] }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.comments.json')) {
      await route.fulfill({ status: 404, headers, body: JSON.stringify({ message: 'Not Found' }) });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'doc-sha',
          content: Buffer.from('# Camera Session\n\nThe camera should initialize lazily.').toString('base64'),
        }),
      });
      return;
    }

    if (url.includes('/commits')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify([
          {
            commit: { message: 'Update proposal', author: { date: '2026-06-21T05:00:00Z' } },
            author: { login: 'jdoe', avatar_url: 'https://example.com/avatar.png' },
          },
        ]),
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

  await expect(page.getByRole('heading', { name: 'Camera Session' })).toBeVisible();
  await expect(page.getByText('The camera should initialize lazily.')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('proposal-review:rate-limit', {
        detail: {
          limit: 5000,
          remaining: 0,
          reset: new Date('2030-01-01T00:00:00Z'),
        },
      }),
    );
  });

  await expect(page.getByText(/API rate limit exceeded/i)).toBeVisible();
});
