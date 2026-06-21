import type { Hono } from 'hono';

import { listFiles } from '../fs/operations.js';
import type { TreeEntry } from '../types.js';
import type { RouteHelpers } from './user.js';

export interface TreeRouteHelpers extends RouteHelpers {
  basePath: string;
  toApiPath: (localPath: string) => string;
}

export function registerTreeRoute(app: Hono, helpers: TreeRouteHelpers): void {
  app.get('/api/github/repos/:owner/:repo/git/trees/:ref', async () => {
    const tree = await listFiles(helpers.basePath);
    return helpers.json({
      tree: tree.map((entry: TreeEntry) => ({
        path: helpers.toApiPath(entry.path),
        type: entry.type,
      })),
    });
  });
}
