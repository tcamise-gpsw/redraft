import { Hono } from 'hono';

import { FileOperationError } from '../types.js';
import { registerCommitsRoute } from './commits.js';
import { registerContentsRoute } from './contents.js';
import { registerTreeRoute } from './tree.js';
import { registerUserRoute, type RouteHelpers } from './user.js';

const RATE_LIMIT_HEADERS = {
  'x-ratelimit-limit': '1000000',
  'x-ratelimit-remaining': '999999',
  'x-ratelimit-reset': '4102444800',
};

function toLocalPath(apiPath: string): string {
  if (!apiPath.startsWith('proposals/')) {
    throw new FileOperationError(404, `Unsupported path: ${apiPath}`);
  }

  return apiPath.slice('proposals/'.length);
}

function toApiPath(localPath: string): string {
  return `proposals/${localPath}`;
}

export function buildGitHubApiRouter(basePath: string): Hono {
  const app = new Hono();
  const json: RouteHelpers['json'] = <T>(body: T, status = 200) => {
    const response = Response.json(body, { status });
    for (const [header, value] of Object.entries(RATE_LIMIT_HEADERS)) {
      response.headers.set(header, value);
    }
    return response;
  };

  app.onError((error) => {
    if (error instanceof FileOperationError) {
      return json({ message: error.message }, error.status);
    }

    return json({ message: error instanceof Error ? error.message : 'Unknown error' }, 500);
  });

  const helpers = { basePath, json, toApiPath, toLocalPath };
  registerUserRoute(app, helpers);
  registerTreeRoute(app, helpers);
  registerContentsRoute(app, helpers);
  registerCommitsRoute(app, helpers);

  return app;
}
