import { expect, test, type Page } from '@playwright/test';

const headers = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4999',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

const mainBranchContent = `# Camera Session

Main branch marker
`;
const sharedBranchContent = `# Camera Session

Shared-link branch marker
`;

async function mockGitHubApi(page: Page) {
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

    if (decodedUrl.includes('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          tree: [
            { path: 'camera-session.md', type: 'blob' },
            {
              path: '.redraft/comments/main/camera-session.comments.json',
              type: 'blob',
            },
            {
              path: '.redraft/comments/redraft/camera-session.comments.json',
              type: 'blob',
            },
          ],
        }),
      });
      return;
    }

    if (decodedUrl.includes('/contents/.redraft/comments/')) {
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

    if (decodedUrl.includes('/contents/camera-session.md')) {
      const requestUrl = new URL(url);
      const ref = requestUrl.searchParams.get('ref');
      await route.fulfill({
        status: 200,
        headers,
        body: JSON.stringify({
          type: 'file',
          sha: ref === 'redraft' ? 'doc-redraft-sha' : 'doc-main-sha',
          content: Buffer.from(
            ref === 'redraft' ? sharedBranchContent : mainBranchContent,
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
}

async function authenticate(page: Page) {
  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByLabel('Repository').fill('acme/workspace');
  await page.getByRole('button', { name: 'Connect' }).click();
}

test('shareable link round-trip preserves repo and branch after auth', async ({
  page,
}) => {
  await mockGitHubApi(page);
  await page.goto('/');
  await authenticate(page);

  await page
    .getByRole('link', { name: /camera-session.md/ })
    .first()
    .click();
  await expect(
    page.getByRole('heading', { name: 'Camera Session' }),
  ).toBeVisible();

  await page.getByRole('button', { name: 'main' }).click();
  await page.getByText('redraft', { exact: true }).click();
  await page
    .getByRole('link', { name: /camera-session.md/ })
    .first()
    .click();
  await expect(page.getByText('Shared-link branch marker')).toBeVisible();

  await page.evaluate(() => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: (value: string) => {
          (window as Window & { __copiedText?: string }).__copiedText = value;
          return Promise.resolve();
        },
      },
    });
  });
  await page.getByRole('button', { name: 'Copy link' }).click();
  await expect(page.getByRole('button', { name: /copied/i })).toBeVisible();

  const copiedUrl = await page.evaluate(
    () => (window as Window & { __copiedText?: string }).__copiedText,
  );
  expect(copiedUrl).toBeTruthy();
  expect(copiedUrl).not.toContain('ghp_');

  const parsedUrl = new URL(copiedUrl!);
  const [hashPath, hashQuery = ''] = parsedUrl.hash.slice(1).split('?');
  const params = new URLSearchParams(hashQuery);
  expect(hashPath).toBe('/d/camera-session.md');
  expect(params.get('repo')).toBe('acme/workspace');
  expect(params.get('branch')).toBe('redraft');

  await page.evaluate(() => localStorage.clear());
  await page.goto(copiedUrl!);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.getByLabel('Repository')).toHaveValue('acme/workspace');

  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByText('Shared-link branch marker')).toBeVisible();
  await expect(page.getByText('Main branch marker')).toHaveCount(0);
});

test('unauthenticated share URL prefills AuthForm repository and stays gated', async ({
  page,
}) => {
  await mockGitHubApi(page);

  await page.goto('/#/d/camera-session.md?repo=acme/workspace&branch=redraft');

  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
  await expect(page.getByLabel('Repository')).toHaveValue('acme/workspace');
  await expect(page.getByLabel('GitHub PAT')).toBeVisible();
});
