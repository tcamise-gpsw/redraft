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
          tree: [
            { path: 'camera-session.md', type: 'blob' },
            {
              path: '.redraft/comments/main/camera-session.comments.json',
              type: 'blob',
            },
          ],
        }),
      });
      return;
    }

    if (
      decodedUrl.includes(
        '/contents/.redraft/comments/main/camera-session.comments.json',
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
        '/contents/.redraft/comments/main/camera-session.comments.json',
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
  await page
    .getByRole('link', { name: /camera-session.md/ })
    .first()
    .click();

  await expect(page.getByText('Existing note')).toBeVisible();

  await page.getByRole('button', { name: 'Reply' }).click();
  await page.getByLabel('Reply').fill('Question');
  await page.getByRole('button', { name: 'Submit reply' }).click();
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByText('Question')).toBeVisible();
  expect(commentsFile).toContain('Question');
});

test('pending comment form appears inside the anchor stack on desktop, not above it (issue #24)', async ({
  page,
}) => {
  // Wide viewport activates the positioned (desktop) layout (≥1024 px).
  await page.setViewportSize({ width: 1400, height: 900 });

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
            '# Camera Session\n\nThe camera should initialize lazily when preview starts.\n\nMore text follows here so the document has enough content to scroll.\n',
            'utf8',
          ).toString('base64'),
        }),
      });
      return;
    }
    // No sidecar — 404 keeps the comment list empty.
    if (decodedUrl.includes('.comments.json')) {
      await route.fulfill({ status: 404, headers, body: JSON.stringify({}) });
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
  await page
    .getByRole('link', { name: /camera-session.md/ })
    .first()
    .click();

  // Wait for the editor to render.
  await expect(page.locator('.ProseMirror')).toBeVisible();

  // Select text via DOM text-node walker (see e2e skill) and dispatch mouseup.
  await page.evaluate(() => {
    const root = document.querySelector('.ProseMirror');
    if (!root) throw new Error('ProseMirror root not found');
    const nodes: [Text, number][] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let pos = 0;
    let n: Node | null;
    while ((n = walker.nextNode())) {
      nodes.push([n as Text, pos]);
      pos += (n.textContent ?? '').length;
    }
    const fullText = nodes.map(([n]) => n.textContent ?? '').join('');
    const target = 'initialize lazily';
    const start = fullText.indexOf(target);
    if (start === -1) throw new Error(`"${target}" not found in rendered text`);
    const end = start + target.length;
    let startNode: Text | null = null,
      startOffset = 0;
    let endNode: Text | null = null,
      endOffset = 0;
    for (const [x, xs] of nodes) {
      const xe = xs + (x.textContent ?? '').length;
      if (!startNode && xe > start) {
        startNode = x;
        startOffset = start - xs;
      }
      if (!endNode && xe >= end) {
        endNode = x;
        endOffset = end - xs;
        break;
      }
    }
    if (!startNode || !endNode)
      throw new Error('Could not build selection range');
    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    (root as HTMLElement).focus();
    startNode.parentElement?.scrollIntoView({
      block: 'center',
      behavior: 'instant',
    });
    document.dispatchEvent(new Event('selectionchange'));
    (root as HTMLElement).dispatchEvent(
      new MouseEvent('mouseup', { bubbles: true }),
    );
  });

  // Wait for the Comment button popover to appear (async React state update).
  await expect(page.getByRole('button', { name: /^comment$/i })).toBeVisible({
    timeout: 2000,
  });
  await page.getByRole('button', { name: /^comment$/i }).click();

  // The form must be visible.
  const pendingForm = page.getByTestId('pending-comment-form');
  await expect(pendingForm).toBeVisible();

  // On desktop the form must be INSIDE the anchor stack, not a sibling before it.
  const isInsideStack = await pendingForm.evaluate(
    (el) => el.closest('[data-testid="comment-anchor-stack"]') !== null,
  );
  expect(isInsideStack).toBe(true);

  // The form's top edge must be at or below the stack's top edge —
  // it is aligned with the selection, not scrolled off to the top of the sidebar.
  const formBox = await pendingForm.boundingBox();
  const stackBox = await page.getByTestId('comment-anchor-stack').boundingBox();
  expect(formBox).not.toBeNull();
  expect(stackBox).not.toBeNull();
  // Allow 1 px rounding tolerance.
  expect(formBox!.y).toBeGreaterThanOrEqual(stackBox!.y - 1);
});
