import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { Hono } from 'hono';

import type { RouteHelpers } from './user.js';

export interface CommitsRouteHelpers extends RouteHelpers {
  basePath: string;
  toLocalPath: (apiPath: string) => string;
}

export function registerCommitsRoute(
  app: Hono,
  helpers: CommitsRouteHelpers,
): void {
  app.get('/api/github/repos/:owner/:repo/commits', async (c) => {
    const apiPath = c.req.query('path');

    if (!apiPath) {
      return helpers.json([]);
    }

    const localPath = helpers.toLocalPath(apiPath);
    const fileStats = await stat(resolve(helpers.basePath, localPath));

    return helpers.json([
      {
        commit: {
          message: 'Local file update',
          author: { date: fileStats.mtime.toISOString() },
        },
        author: {
          login: 'local-user',
          avatar_url: '',
        },
      },
    ]);
  });
}
