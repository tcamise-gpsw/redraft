import { createServer, type IncomingMessage } from 'node:http';
import { AddressInfo } from 'node:net';

import { WebSocket } from 'ws';
import { afterEach, describe, expect, it } from 'vitest';

import { WebSocketHub } from './hub.js';

function once<T>(
  target: {
    once: (event: string, listener: (...args: unknown[]) => void) => unknown;
  },
  event: string,
): Promise<T> {
  const { promise, resolve, reject } = Promise.withResolvers<T>();
  target.once(event, (...args: unknown[]) => {
    resolve((args[0] as T) ?? (undefined as T));
  });
  if ('once' in target && target !== null && 'close' in (target as object)) {
    (target as WebSocket).once('error', reject);
  }
  return promise;
}

function listen(server: ReturnType<typeof createServer>): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.listen(0, '127.0.0.1', (error?: Error) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
  return promise;
}

function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  server.close((error) => {
    if (error) {
      reject(error);
      return;
    }

    resolve();
  });
  return promise;
}

describe('WebSocketHub', () => {
  const cleanups: Array<() => Promise<void>> = [];

  afterEach(async () => {
    while (cleanups.length > 0) {
      const cleanup = cleanups.pop();
      if (cleanup) {
        await cleanup();
      }
    }
  });

  it('broadcasts events to all connected clients', async () => {
    const hub = new WebSocketHub();
    const server = createServer();
    server.on('upgrade', (request, socket, head) => {
      hub.handleUpgrade(request as IncomingMessage, socket, head);
    });

    await listen(server);

    cleanups.push(async () => {
      await hub.close();
      await closeServer(server);
    });

    const { port } = server.address() as AddressInfo;
    const clientA = new WebSocket(`ws://127.0.0.1:${port}`);
    const clientB = new WebSocket(`ws://127.0.0.1:${port}`);

    cleanups.push(async () => {
      clientA.close();
      clientB.close();
    });

    await Promise.all([once(clientA, 'open'), once(clientB, 'open')]);
    expect(hub.connectionCount).toBe(2);

    const messageA = once<Buffer>(clientA, 'message');
    const messageB = once<Buffer>(clientB, 'message');

    hub.broadcast({
      type: 'file:changed',
      path: 'proposal.md',
      sha: 'abc123',
    });

    await expect(messageA).resolves.toEqual(
      Buffer.from(
        '{"type":"file:changed","path":"proposal.md","sha":"abc123"}',
      ),
    );
    await expect(messageB).resolves.toEqual(
      Buffer.from(
        '{"type":"file:changed","path":"proposal.md","sha":"abc123"}',
      ),
    );
  });

  it('removes disconnected clients from the connection count', async () => {
    const hub = new WebSocketHub();
    const server = createServer();
    server.on('upgrade', (request, socket, head) => {
      hub.handleUpgrade(request as IncomingMessage, socket, head);
    });

    await listen(server);

    cleanups.push(async () => {
      await hub.close();
      await closeServer(server);
    });

    const { port } = server.address() as AddressInfo;
    const client = new WebSocket(`ws://127.0.0.1:${port}`);
    cleanups.push(async () => {
      client.close();
    });

    await once(client, 'open');
    expect(hub.connectionCount).toBe(1);

    const disconnected = once<number>(hub, 'connection-count');
    client.close();
    await disconnected;

    expect(hub.connectionCount).toBe(0);
  });
});
