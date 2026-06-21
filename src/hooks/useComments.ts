import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { nanoid } from 'nanoid';

import { ConflictError, GitHubClient } from '../lib/github';
import { useAuth } from './useAuth';
import type {
  CommentFile,
  CommentReply,
  CommentThread,
} from '../types/comments';

function commentPath(path: string): string {
  return path.replace(/\.md$/, '.comments.json');
}

function fileName(path: string): string {
  return path.split('/').at(-1) ?? path;
}

export function useComments(path: string) {
  const { pat, repo } = useAuth();
  const queryClient = useQueryClient();

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({ pat, owner: repo.owner, repo: repo.repo });
  }, [pat, repo]);

  async function addComment(
    thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies'>,
  ): Promise<void> {
    if (!client) {
      throw new Error('Authentication is required');
    }

    try {
      const pathToComments = commentPath(path);
      const existing = await client.getFileContent(pathToComments, {
        optional: true,
      });
      const nextThread: CommentThread = {
        ...thread,
        id: nanoid(),
        createdAt: new Date().toISOString(),
        replies: [],
      };

      if (!existing) {
        const initialFile: CommentFile = { version: 1, comments: [nextThread] };
        await client.createFile(
          pathToComments,
          JSON.stringify(initialFile),
          `Add comment on ${fileName(path)}`,
        );
      } else {
        const parsed = JSON.parse(existing.content) as CommentFile;
        const nextFile: CommentFile = {
          ...parsed,
          comments: [...parsed.comments, nextThread],
        };
        await client.updateFile(
          pathToComments,
          JSON.stringify(nextFile),
          existing.sha,
          `Add comment on ${fileName(path)}`,
        );
      }

      await queryClient.invalidateQueries({
        queryKey: ['proposal', path, 'comments'],
      });
    } catch (error) {
      if (
        error instanceof ConflictError ||
        (error instanceof Error && /sha|conflict/i.test(error.message))
      ) {
        throw new Error(
          'File was modified since you loaded it. Please refresh and re-apply your changes.',
        );
      }
      throw error;
    }
  }

  async function addReply(
    threadId: string,
    reply: Omit<CommentReply, 'id' | 'createdAt'>,
  ): Promise<void> {
    if (!client) {
      throw new Error('Authentication is required');
    }

    try {
      const pathToComments = commentPath(path);
      const existing = await client.getFileContent(pathToComments);
      if (!existing) {
        throw new Error(`Missing comments file for ${pathToComments}`);
      }

      const parsed = JSON.parse(existing.content) as CommentFile;
      const nextFile: CommentFile = {
        ...parsed,
        comments: parsed.comments.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                replies: [
                  ...thread.replies,
                  {
                    ...reply,
                    id: nanoid(),
                    createdAt: new Date().toISOString(),
                  },
                ],
              }
            : thread,
        ),
      };

      await client.updateFile(
        pathToComments,
        JSON.stringify(nextFile),
        existing.sha,
        `Reply to comment on ${fileName(path)}`,
      );
      await queryClient.invalidateQueries({
        queryKey: ['proposal', path, 'comments'],
      });
    } catch (error) {
      if (
        error instanceof ConflictError ||
        (error instanceof Error && /sha|conflict/i.test(error.message))
      ) {
        throw new Error(
          'File was modified since you loaded it. Please refresh and re-apply your changes.',
        );
      }
      throw error;
    }
  }

  async function resolveThread(threadId: string): Promise<void> {
    if (!client) {
      throw new Error('Authentication is required');
    }

    try {
      const pathToComments = commentPath(path);
      const existing = await client.getFileContent(pathToComments);
      if (!existing) {
        throw new Error(`Missing comments file for ${pathToComments}`);
      }
      const parsed = JSON.parse(existing.content) as CommentFile;
      const nextFile: CommentFile = {
        ...parsed,
        comments: parsed.comments.map((thread) =>
          thread.id === threadId
            ? {
                ...thread,
                resolved: !thread.resolved,
              }
            : thread,
        ),
      };

      await client.updateFile(
        pathToComments,
        JSON.stringify(nextFile),
        existing.sha,
        `Resolve comment on ${fileName(path)}`,
      );
      await queryClient.invalidateQueries({
        queryKey: ['proposal', path, 'comments'],
      });
    } catch (error) {
      if (
        error instanceof ConflictError ||
        (error instanceof Error && /sha|conflict/i.test(error.message))
      ) {
        throw new Error(
          'File was modified since you loaded it. Please refresh and re-apply your changes.',
        );
      }
      throw error;
    }
  }

  return {
    addComment,
    addReply,
    resolveThread,
  };
}
