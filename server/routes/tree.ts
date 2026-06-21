import type { Hono } from 'hono';

import { listReviewEntries, walkMarkdownFiles } from '../fs/operations.js';
import type { ReviewEntry, TreeEntry } from '../types.js';
import type { RouteHelpers } from './user.js';

export interface TreeRouteHelpers extends RouteHelpers {
  basePath: string;
  toApiPath: (localPath: string) => string;
}

export function registerTreeRoute(app: Hono, helpers: TreeRouteHelpers): void {
  app.get('/api/github/repos/:owner/:repo/git/trees/:ref', async () => {
    const documents = await walkMarkdownFiles(helpers.basePath);
    const underReview = await listReviewEntries(helpers.basePath);

    return helpers.json({
      documents: documents.map((entry: TreeEntry) => ({
        path: helpers.toApiPath(entry.path),
        type: entry.type,
      })),
      underReview: underReview.map((entry: ReviewEntry) => ({
        path: helpers.toApiPath(entry.path),
        unresolvedCount: entry.unresolvedCount,
      })),
    });
  });
}
