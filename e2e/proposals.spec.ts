import { expect, test } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4988',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

const proposalContent = `# Camera Session

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
\`\`\`
`;

test('proposal viewing renders Milkdown content and shows the rate-limit banner', async ({ page }) => {
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
          tree: [{ path: 'proposals/camera-session.md', type: 'blob' }],
        }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.comments.json')) {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/camera-session.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'doc-sha',
          content: Buffer.from(proposalContent).toString('base64'),
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
            commit: {
              message: 'Update proposal',
              author: { date: '2026-06-21T05:00:00Z' },
            },
            author: {
              login: 'jdoe',
              avatar_url: 'https://example.com/avatar.png',
            },
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

  await expect(page.locator('.milkdown-document-wrapper')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Camera Session' })).toBeVisible();
  await expect(page.getByText('initialize lazily')).toBeVisible();
  await expect(page.getByText('Preview', { exact: true })).toBeVisible();
  await expect(page.getByText('const ready = true;')).toBeVisible();
  await expect(page.locator('.milkdown-mermaid-block svg')).toBeVisible();

  await page.evaluate(() => {
    window.dispatchEvent(
      new CustomEvent('redraft:rate-limit', {
        detail: {
          limit: 5000,
          remaining: 0,
          reset: new Date('2030-01-01T00:00:00Z'),
        },
      }),
    );
  });

  await expect(page.getByText(/GitHub rate limit hit/i)).toBeVisible();
});

const multiMermaidContent = `# Auth Overhaul

Token refresh flow:

\`\`\`mermaid
sequenceDiagram
    Client->>Server: POST /auth/refresh
    Server-->>Client: 200 new access token
\`\`\`

Request decision:

\`\`\`mermaid
flowchart TD
    R([Request]) --> A{Valid token?}
    A -- Yes --> G([Allow])
    A -- No --> U[401]
\`\`\`
`;

test('multiple mermaid diagram types render without id collision', async ({ page }) => {
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
          tree: [{ path: 'proposals/auth-overhaul.md', type: 'blob' }],
        }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/auth-overhaul.comments.json')) {
      await route.fulfill({
        status: 404,
        headers,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/proposals/auth-overhaul.md')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: 'auth-sha',
          content: Buffer.from(multiMermaidContent).toString('base64'),
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
            commit: {
              message: 'Add auth overhaul',
              author: { date: '2026-06-21T05:00:00Z' },
            },
            author: {
              login: 'jdoe',
              avatar_url: 'https://example.com/avatar.png',
            },
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
  await page.getByRole('link', { name: 'auth-overhaul.md' }).click();

  await expect(page.locator('.milkdown-document-wrapper')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Auth Overhaul' })).toBeVisible();

  // Both diagrams must render as SVG — no id collision between them
  const diagrams = page.locator('.milkdown-mermaid-block svg');
  await expect(diagrams).toHaveCount(2);
  await expect(diagrams.first()).toBeVisible();
  await expect(diagrams.last()).toBeVisible();
});
