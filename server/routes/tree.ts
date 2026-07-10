import type { Hono } from 'hono';

import { execGitText } from '../fs/git-exec.js';
import { listSidecarEntries } from '../fs/git-sidecar.js';
import { walkMarkdownFiles } from '../fs/operations.js';
import type { ReviewEntry, TreeEntry } from '../types.js';
import type { RouteHelpers } from './user.js';

async function resolveTreeBranch(
  basePath: string,
  ref: string,
): Promise<string> {
  if (ref !== 'HEAD') {
    return ref;
  }

  try {
    const stdout = await execGitText(basePath, [
      'rev-parse',
      '--abbrev-ref',
      'HEAD',
    ]);
    const branch = stdout.trim();
    return branch === '' || branch === 'HEAD' ? 'main' : branch;
  } catch {
    return 'main';
  }
}

export interface TreeRouteHelpers extends RouteHelpers {
  basePath: string;
  toApiPath: (localPath: string) => string;
  sidecarBranch: string;
}

export function registerTreeRoute(app: Hono, helpers: TreeRouteHelpers): void {
  app.get('/api/github/repos/:owner/:repo/git/trees/:ref', async (c) => {
    const ref = c.req.param('ref');
    const branch = await resolveTreeBranch(helpers.basePath, ref);
    const documents = await walkMarkdownFiles(helpers.basePath);
    const sidecarBranch = c.req.query('sidecarBranch') ?? helpers.sidecarBranch;
    const underReview = await listSidecarEntries(
      helpers.basePath,
      sidecarBranch,
      branch,
    );
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
