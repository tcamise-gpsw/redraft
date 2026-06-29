import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4988',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

const documentContent = `# Camera Session

## Checklist

- initialize lazily
- keep preview warm

| Mode | Behavior |
| --- | --- |
| Preview | Lazy |

\`\`\`ts
const ready = true;
\`\`\`

\`\`\`mermaid
graph TD
  Camera --> Preview
\`\`\``;

test('document viewing renders Milkdown content and the split tree', async ({
  page,
}) => {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const decodedUrl = decodeURIComponent(url);

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
            { path: 'docs/auth-overhaul.md', type: 'blob' },
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
      )
    ) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'comment-sha',
          content: Buffer.from('{"version":1,"comments":[]}', 'utf8').toString(
            'base64',
          ),
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/docs/auth-overhaul.comments.json',
      )
    ) {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/camera-session.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'doc-sha',
          content: Buffer.from(documentContent, 'utf8').toString('base64'),
        }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/docs/auth-overhaul.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'auth-sha',
          content: Buffer.from('# Auth Overhaul\n', 'utf8').toString('base64'),
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

  await expect(page.getByText('Under Review')).toBeVisible();
  await expect(
    page.getByRole('link', { name: /camera-session.md/ }).first(),
  ).toBeVisible();
  await page
    .getByRole('link', { name: /camera-session.md/ })
    .first()
    .click();

  await expect(page.locator('.milkdown-document-wrapper')).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Camera Session' }),
  ).toBeVisible();
  await expect(page.getByText('initialize lazily')).toBeVisible();
  await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('const ready = true;')).toBeVisible();
  await expect(page.locator('.milkdown-mermaid-block svg')).toBeVisible();

  await expect(
    page.getByRole('link', { name: 'auth-overhaul.md' }),
  ).toBeVisible();
});

const multiMermaidContent = `# Auth Overhaul

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

\`\`\`mermaid
sequenceDiagram
  participant API
  participant UI
  API->>UI: notify
\`\`\`
`;

test('multiple mermaid diagram types render without id collision', async ({
  page,
}) => {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();
    const decodedUrl = decodeURIComponent(url);

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
          tree: [{ path: 'docs/auth-overhaul.md', type: 'blob' }],
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/docs/auth-overhaul.comments.json',
      )
    ) {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/docs/auth-overhaul.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'auth-sha',
          content: Buffer.from(multiMermaidContent, 'utf8').toString('base64'),
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
  await page.getByRole('link', { name: 'auth-overhaul.md' }).click();

  await expect(page.locator('.milkdown-mermaid-block svg')).toHaveCount(2);
});
