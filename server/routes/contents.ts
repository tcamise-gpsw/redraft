import type { Hono } from 'hono';

import {
  createGitFile,
  deleteGitFile,
  readGitFile,
  writeGitFile,
} from '../fs/git-sidecar.js';

import {
  createFile,
  deleteFile,
  readFile,
  writeFile,
} from '../fs/operations.js';
import { FileOperationError } from '../types.js';
import type { RouteHelpers } from './user.js';

interface ContentRequestBody {
  branch?: string;
  content?: string;
  message?: string;
  sha?: string;
}

export interface ContentsRouteHelpers extends RouteHelpers {
  basePath: string;
  toLocalPath: (apiPath: string) => string;
}

function decodeContent(body: ContentRequestBody): Buffer {
  if (!body.content) {
    throw new FileOperationError(
      400,
      'Request body must include base64 content.',
    );
  }

  return Buffer.from(body.content, 'base64');
}

function requireApiPath(path: string | undefined): string {
  if (!path) {
    throw new FileOperationError(400, 'Request path is required.');
  }

  return path;
}

function commitMessage(body: ContentRequestBody, fallback: string): string {
  return body.message ?? fallback;
}

export function registerContentsRoute(
  app: Hono,
  helpers: ContentsRouteHelpers,
): void {
  app.get('/api/github/repos/:owner/:repo/contents/:path{.+}', async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param('path')));
    const ref = c.req.query('ref');
    const file = ref
      ? await readGitFile(helpers.basePath, ref, localPath)
      : await readFile(helpers.basePath, localPath);

    return helpers.json({
      type: 'file',
      sha: file.sha,
      content: file.content.toString('base64'),
    });
  });

  app.put('/api/github/repos/:owner/:repo/contents/:path{.+}', async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param('path')));
    const body = (await c.req.json()) as ContentRequestBody;
    let result: { sha: string };
    if (body.branch) {
      result = body.sha
        ? await writeGitFile(
            helpers.basePath,
            body.branch,
            localPath,
            decodeContent(body),
            body.sha,
            commitMessage(body, `Update ${localPath}`),
          )
        : await createGitFile(
            helpers.basePath,
            body.branch,
            localPath,
            decodeContent(body),
            commitMessage(body, `Create ${localPath}`),
          );
    } else {
      try {
        result = await writeFile(
          helpers.basePath,
          localPath,
          decodeContent(body),
          body.sha ?? null,
        );
      } catch (error) {
        if (
          error instanceof FileOperationError &&
          error.status === 404 &&
          !body.sha
        ) {
          result = await createFile(
            helpers.basePath,
            localPath,
            decodeContent(body),
          );
        } else {
          throw error;
        }
      }
    }

    return helpers.json({ content: { sha: result.sha } });
  });

  app.post('/api/github/repos/:owner/:repo/contents/:path{.+}', async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param('path')));
    const body = (await c.req.json()) as ContentRequestBody;
    const result = body.branch
      ? await createGitFile(
          helpers.basePath,
          body.branch,
          localPath,
          decodeContent(body),
          commitMessage(body, `Create ${localPath}`),
        )
      : await createFile(helpers.basePath, localPath, decodeContent(body));

    return helpers.json({ content: { sha: result.sha } }, 201);
  });

  app.delete('/api/github/repos/:owner/:repo/contents/:path{.+}', async (c) => {
    const localPath = helpers.toLocalPath(requireApiPath(c.req.param('path')));
    const body = (await c.req.json()) as ContentRequestBody;

    if (!body.sha) {
      throw new FileOperationError(400, 'Request body must include a sha.');
    }

    if (body.branch) {
      await deleteGitFile(helpers.basePath, body.branch, localPath, body.sha);
    } else {
      await deleteFile(helpers.basePath, localPath, body.sha);
    }
    return helpers.json({ content: null });
  });
}
