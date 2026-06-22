import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4990',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('comment flow selects text, opens the form, and writes a centralized sidecar file', async ({
  page,
}) => {
  let commentsFile = JSON.stringify({
    version: 1,
    comments: [
      {
        id: 'thread-1',
        quote: 'initialize lazily',
        quoteContext: {
          prefix: 'The camera should ',
          suffix: ' when preview starts.',
        },
        author: { login: 'jdoe', avatarUrl: 'https://example.com/avatar.png' },
        body: 'Existing note',
        createdAt: '2026-06-21T00:00:00Z',
        resolved: false,
        replies: [],
      },
    ],
  });

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

    if (url.includes('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          tree: [
            { path: 'camera-session.md', type: 'blob' },
            {
              path: '.redraft/comments/camera-session.comments.json',
              type: 'blob',
            },
          ],
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/camera-session.comments.json',
      ) &&
      method === 'GET'
    ) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'comments-sha',
          content: Buffer.from(commentsFile, 'utf8').toString('base64'),
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/camera-session.comments.json',
      ) &&
      method === 'PUT'
    ) {
      const requestBody = route.request().postData() ?? '{}';
      const parsed = JSON.parse(requestBody) as { content: string };
      commentsFile = Buffer.from(parsed.content, 'base64').toString('utf8');
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          content: { sha: 'updated-comments-sha' },
        }),
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
          sha: 'doc-sha',
          content: Buffer.from(
            '# Camera Session\n\nThe camera should initialize lazily when preview starts.\n',
            'utf8',
          ).toString('base64'),
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
  await page.getByRole('link', { name: /camera-session.md/ }).click();

  await expect(page.getByText('Existing note')).toBeVisible();

  await page.getByRole('button', { name: 'Reply' }).click();
  await page.getByLabel('Reply').fill('Question');
  await page.getByRole('button', { name: 'Submit reply' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Question')).toBeVisible();
  expect(commentsFile).toContain('Question');
});
