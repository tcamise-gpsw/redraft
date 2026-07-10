import {
  createServer,
  type IncomingMessage,
  type Server as HttpServer,
} from 'node:http';
import { access, readFile, stat } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';

import type { Hono } from 'hono';

import { buildGitHubApiRouter } from './routes/index.js';
import { WebSocketHub } from './ws/hub.js';

export interface ReDraftAppOptions {
  basePath: string;
  uiRoot: string;
  noUi?: boolean;
  sidecarBranch?: string;
}

export interface ReDraftServerOptions extends ReDraftAppOptions {
  host?: string;
  port?: number;
}

export interface RunningReDraftServer {
  app: Hono;
  hub: WebSocketHub;
  server: HttpServer;
  url: string;
  close: () => Promise<void>;
}

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function injectLocalModeMeta(html: string): string {
  const metaTag = '<meta name="redraft-mode" content="local">';

  if (html.includes(metaTag)) {
    return html;
  }

  if (html.includes('</head>')) {
    return html.replace('</head>', `  ${metaTag}</head>`);
  }

  return `${metaTag}${html}`;
}

function contentTypeFor(path: string): string {
  return CONTENT_TYPE_BY_EXTENSION[extname(path)] ?? 'application/octet-stream';
}

async function loadStaticResponse(
  uiRoot: string,
  requestPath: string,
): Promise<Response | null> {
  const resolvedUiRoot = resolve(uiRoot);
  const normalizedPath =
    requestPath === '/' ? 'index.html' : requestPath.replace(/^\//, '');
  const staticPath = resolve(resolvedUiRoot, normalizedPath);

  if (!staticPath.startsWith(resolvedUiRoot)) {
    return null;
  }

  try {
    const fileStats = await stat(staticPath);
    if (!fileStats.isFile()) {
      return null;
    }
  } catch {
    return null;
  }

  const file = await readFile(staticPath);
  const body =
    normalizedPath === 'index.html'
      ? injectLocalModeMeta(file.toString('utf8'))
      : file;
  return new Response(body, {
    headers: { 'content-type': contentTypeFor(normalizedPath) },
  });
}

export function buildReDraftApp(options: ReDraftAppOptions): Hono {
  const app = buildGitHubApiRouter(options.basePath, {
    sidecarBranch: options.sidecarBranch ?? 'redraft',
  });

  // Lightweight health probe — used to verify the server is reachable.
  app.get('/api/health', (c) => c.json({ ok: true, mode: 'local' }));

  app.get('*', async (c) => {
    if (options.noUi) {
      return c.notFound();
    }

    const { pathname } = new URL(c.req.url);
    const directFile = await loadStaticResponse(options.uiRoot, pathname);
    if (directFile) {
      return directFile;
    }
    if (extname(pathname) !== '' && !pathname.startsWith('/d/')) {
      return c.notFound();
    }

    const indexFile = await loadStaticResponse(options.uiRoot, '/');
    return indexFile ?? c.notFound();
  });

  return app;
}

function toRequest(request: IncomingMessage, fallbackOrigin: string): Request {
  const url = new URL(request.url ?? '/', fallbackOrigin);
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(', '));
      continue;
    }

    if (value !== undefined) {
      headers.set(key, value);
    }
  }

  const init: RequestInit & { duplex?: 'half' } = {
    method: request.method,
    headers,
  };

  if (request.method && !['GET', 'HEAD'].includes(request.method)) {
    init.body = Readable.toWeb(request) as NonNullable<RequestInit['body']>;
    init.duplex = 'half';
  }

  return new Request(url, init);
}

async function sendResponse(
  response: Response,
  nodeResponse: import('node:http').ServerResponse,
): Promise<void> {
  nodeResponse.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeResponse.setHeader(key, value);
  });

  if (!response.body) {
    nodeResponse.end();
    return;
  }

  const { promise, resolve, reject } = Promise.withResolvers<void>();
  Readable.fromWeb(response.body).pipe(nodeResponse);
  nodeResponse.once('finish', resolve);
  nodeResponse.once('error', reject);
  await promise;
}

export async function startReDraftServer(
  options: ReDraftServerOptions,
): Promise<RunningReDraftServer> {
  const host = options.host ?? '127.0.0.1';
  const requestedPort = options.port ?? 4200;
  const app = buildReDraftApp(options);
  const hub = new WebSocketHub();
  let actualPort = requestedPort;
  const server = createServer(async (request, response) => {
    const honoResponse = await app.fetch(
      toRequest(
        request,
        `http://${request.headers.host ?? `${host}:${actualPort}`}`,
      ),
    );
    await sendResponse(honoResponse, response);
  });

  server.on('upgrade', (request, socket, head) => {
    const url = new URL(
      request.url ?? '/',
      `http://${request.headers.host ?? `${host}:${actualPort}`}`,
    );
    if (url.pathname !== '/ws') {
      socket.destroy();
      return;
    }

    hub.handleUpgrade(request, socket, head);
  });

  const MAX_PORT_ATTEMPTS = 10;
  for (let attempt = 0; attempt < MAX_PORT_ATTEMPTS; attempt++) {
    const {
      promise,
      resolve: resolveListen,
      reject: rejectListen,
    } = Promise.withResolvers<void>();
    server.listen(actualPort, host, () => resolveListen());
    server.once('error', rejectListen);
    try {
      await promise;
      break;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (
        nodeError.code !== 'EADDRINUSE' ||
        attempt === MAX_PORT_ATTEMPTS - 1
      ) {
        if (nodeError.code === 'EADDRINUSE') {
          throw new Error(
            `Could not find a free port in range ${requestedPort}–${actualPort}. Use --port to specify a different starting port.`,
          );
        }
        throw error;
      }
      console.log(
        `Port ${actualPort} is in use, trying ${actualPort + 1} instead.`,
      );
      actualPort++;
    }
  }

  return {
    app,
    hub,
    server,
    url: `http://${host}:${actualPort}`,
    close: async () => {
      await hub.close();
      const {
        promise: closePromise,
        resolve: resolveClose,
        reject: rejectClose,
      } = Promise.withResolvers<void>();
      server.close((error) => {
        if (error) {
          rejectClose(error);
          return;
        }

        resolveClose();
      });
      await closePromise;
    },
  };
}

export function resolveUiRoot(): string {
  return fileURLToPath(new URL('../dist', import.meta.url));
}

export async function verifyUiBuild(uiRoot: string): Promise<void> {
  await access(resolve(uiRoot, 'index.html'));
}
