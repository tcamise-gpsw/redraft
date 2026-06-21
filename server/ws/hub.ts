import { EventEmitter } from 'node:events';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';

import { WebSocket, WebSocketServer } from 'ws';

import type { FileEvent } from '../fs/watcher.js';

export class WebSocketHub extends EventEmitter {
  private readonly server = new WebSocketServer({ noServer: true });
  private readonly clients = new Set<WebSocket>();

  constructor() {
    super();

    this.server.on('connection', (client) => {
      this.clients.add(client);
      this.emit('connection-count', this.connectionCount);

      const removeClient = () => {
        this.clients.delete(client);
        this.emit('connection-count', this.connectionCount);
      };

      client.on('close', removeClient);
      client.on('error', removeClient);
    });
  }

  get connectionCount(): number {
    return this.clients.size;
  }

  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void {
    this.server.handleUpgrade(request, socket, head, (client) => {
      this.server.emit('connection', client, request);
    });
  }

  broadcast(event: FileEvent): void {
    const message = JSON.stringify(event);

    for (const client of this.clients) {
      if (client.readyState !== WebSocket.OPEN) {
        this.clients.delete(client);
        continue;
      }

      client.send(message);
    }
  }

  async close(): Promise<void> {
    const { promise, resolve, reject } = Promise.withResolvers<void>();
    this.server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
    await promise;
  }
}
