import { expect, test } from '@playwright/test';

const rateHeaders = {
  'x-ratelimit-limit': '5000',
  'x-ratelimit-remaining': '4999',
  'x-ratelimit-reset': '1893456000',
  'content-type': 'application/json',
};

test('auth flow accepts a PAT and shows the documents tree', async ({
  page,
}) => {
  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();

    if (url.endsWith('/user')) {
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
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
        headers: rateHeaders,
        body: JSON.stringify({ default_branch: 'main' }),
      });
      return;
    }

    if (url.includes('/branches')) {
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
        body: JSON.stringify([{ name: 'main' }, { name: 'redraft' }]),
      });
      return;
    }

    if (url.includes('/git/trees/')) {
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
        body: JSON.stringify({
          tree: [{ path: 'camera-session.md', type: 'blob' }],
        }),
      });
      return;
    }

    if (url.includes('/contents/')) {
      await route.fulfill({
        status: 404,
        headers: rateHeaders,
        body: JSON.stringify({ message: 'Not Found' }),
      });
      return;
    }

    if (url.includes('/commits')) {
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
        body: JSON.stringify([]),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      headers: rateHeaders,
      body: JSON.stringify({}),
    });
  });

  await page.goto('/');
  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByLabel('Repository').fill('acme/workspace');
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'Under Review' }),
  ).toBeVisible();
  await expect(page.getByText('camera-session.md')).toBeVisible();
});

test('a 401 response clears auth and returns to the auth gate', async ({
  page,
}) => {
  let authenticated = false;

  await page.route('https://api.github.com/**', async (route) => {
    const url = route.request().url();

    if (url.endsWith('/user')) {
      authenticated = true;
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
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
        headers: rateHeaders,
        body: JSON.stringify({ default_branch: 'main' }),
      });
      return;
    }

    if (url.includes('/branches')) {
      await route.fulfill({
        status: 200,
        headers: rateHeaders,
        body: JSON.stringify([{ name: 'main' }, { name: 'redraft' }]),
      });
      return;
    }

    if (authenticated && url.includes('/git/trees/')) {
      await route.fulfill({
        status: 401,
        headers: rateHeaders,
        body: JSON.stringify({ message: 'Bad credentials' }),
      });
      return;
    }

    await route.fulfill({
      status: 404,
      headers: rateHeaders,
      body: JSON.stringify({ message: 'Not Found' }),
    });
  });

  await page.goto('/');
  await page.getByLabel('GitHub PAT').fill('ghp_test');
  await page.getByLabel('Repository').fill('acme/workspace');
  await page.getByRole('button', { name: 'Connect' }).click();

  await expect(page.getByText('Authentication failed')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Connect' })).toBeVisible();
});
