import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { isLocalMode } from '../lib/mode';

interface FileWatcherEvent {
  type: 'file:changed' | 'file:created' | 'file:deleted';
  path?: string;
}

function websocketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function useFileWatcher(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLocalMode()) {
      return;
    }

    let reconnectDelay = 1000;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closedByUser = false;
    let socket: WebSocket | null = null;

    const connect = () => {
      socket = new WebSocket(websocketUrl());

      socket.onopen = () => {
        reconnectDelay = 1000;
      };

      socket.onmessage = (event) => {
        let payload: FileWatcherEvent;
        try {
          payload = JSON.parse(String(event.data)) as FileWatcherEvent;
        } catch {
          return;
        }

        if (payload.type === 'file:changed' && payload.path?.endsWith('.md')) {
          void queryClient.invalidateQueries({
            queryKey: ['proposal', payload.path, 'content'],
          });
          return;
        }

        if (
          payload.type === 'file:changed' &&
          payload.path?.endsWith('.comments.json')
        ) {
          void queryClient.invalidateQueries({
            queryKey: [
              'proposal',
              payload.path.replace(/\.comments\.json$/, '.md'),
              'comments',
            ],
          });
          return;
        }

        if (
          payload.type === 'file:created' ||
          payload.type === 'file:deleted'
        ) {
          void queryClient.invalidateQueries({
            queryKey: ['proposals', 'tree'],
          });
        }
      };

      socket.onclose = () => {
        if (closedByUser) {
          return;
        }

        reconnectTimer = setTimeout(() => {
          connect();
        }, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      };
    };

    connect();

    return () => {
      closedByUser = true;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
      }
      socket?.close();
    };
  }, [queryClient]);
}
