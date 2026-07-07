import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import type { Hono } from 'hono';

import { listReviewEntries, walkMarkdownFiles } from '../fs/operations.js';
import type { ReviewEntry, TreeEntry } from '../types.js';
import type { RouteHelpers } from './user.js';
const execGit = promisify(execFile);

async function resolveTreeBranch(
  basePath: string,
  ref: string,
): Promise<string> {
  if (ref !== 'HEAD') {
    return ref;
  }

  try {
    const { stdout } = await execGit(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: basePath },
    );
    return stdout.trim() || ref;
  } catch {
    return 'main';
  }
}

export interface TreeRouteHelpers extends RouteHelpers {
  basePath: string;
  toApiPath: (localPath: string) => string;
}

export function registerTreeRoute(app: Hono, helpers: TreeRouteHelpers): void {
  app.get('/api/github/repos/:owner/:repo/git/trees/:ref', async (c) => {
    const ref = c.req.param('ref');
    const branch = await resolveTreeBranch(helpers.basePath, ref);
    const documents = await walkMarkdownFiles(helpers.basePath);
    const underReview = await listReviewEntries(helpers.basePath, branch);
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
