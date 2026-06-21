import type { Hono } from 'hono';

export interface RouteHelpers {
  json: <T>(body: T, status?: number) => Response;
}

export function registerUserRoute(app: Hono, helpers: RouteHelpers): void {
  app.get('/api/github/user', (c) => {
    return helpers.json({ login: 'local-user', avatar_url: '' });
  });
}
