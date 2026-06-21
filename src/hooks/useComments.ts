import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
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

  // Local draft state — mutations never touch the network directly.
  // saveComments() flushes the full state in a single write.
  const [localThreads, setLocalThreads] = useState<CommentThread[] | null>(
    null,
  );
  const [localSha, setLocalSha] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const client = useMemo(() => {
    if (!pat || !repo) return null;
    return new GitHubClient({ pat, owner: repo.owner, repo: repo.repo });
  }, [pat, repo]);

  const commentsPath = commentPath(path);

  // One load per path. staleTime: Infinity prevents automatic re-fetches;
  // the local store is the source of truth until a hard reload.
  const commentsQuery = useQuery({
    queryKey: ['proposal', path, 'comments'],
    queryFn: async () => {
      if (!client) throw new Error('Authentication is required');
      return (
        (await client.getFileContent(commentsPath, { optional: true })) ?? null
      );
    },
    enabled: Boolean(client),
    staleTime: Infinity,
  });

  // Reset local state whenever the user navigates to a different proposal.
  useEffect(() => {
    setLocalThreads(null);
    setLocalSha(null);
    setIsDirty(false);
  }, [path]);

  // Seed from the initial fetch result (runs once per load).
  useEffect(() => {
    if (commentsQuery.data !== undefined && localThreads === null) {
      const parsed = commentsQuery.data?.content
        ? (JSON.parse(commentsQuery.data.content) as CommentFile)
        : null;
      setLocalThreads(parsed?.comments ?? []);
      setLocalSha(commentsQuery.data?.sha ?? null);
    }
  }, [commentsQuery.data, localThreads]);

  function addComment(
    thread: Omit<CommentThread, 'id' | 'createdAt' | 'replies'>,
  ): void {
    const next: CommentThread = {
      ...thread,
      id: nanoid(),
      createdAt: new Date().toISOString(),
      replies: [],
    };
    setLocalThreads((prev) => [...(prev ?? []), next]);
    setIsDirty(true);
  }

  function addReply(
    threadId: string,
    reply: Omit<CommentReply, 'id' | 'createdAt'>,
  ): void {
    setLocalThreads((prev) =>
      (prev ?? []).map((t) =>
        t.id === threadId
          ? {
              ...t,
              replies: [
                ...t.replies,
                {
                  ...reply,
                  id: nanoid(),
                  createdAt: new Date().toISOString(),
                },
              ],
            }
          : t,
      ),
    );
    setIsDirty(true);
  }

  function resolveThread(threadId: string): void {
    setLocalThreads((prev) =>
      (prev ?? []).map((t) =>
        t.id === threadId ? { ...t, resolved: !t.resolved } : t,
      ),
    );
    setIsDirty(true);
  }

  async function saveComments(): Promise<void> {
    if (!client) throw new Error('Authentication is required');

    setIsSaving(true);
    try {
      const nextFile: CommentFile = {
        version: 1,
        comments: localThreads ?? [],
      };
      const content = JSON.stringify(nextFile);

      if (localSha) {
        const result = await client.updateFile(
          commentsPath,
          content,
          localSha,
          `Update comments on ${fileName(path)}`,
        );
        setLocalSha(result.sha);
      } else {
        const result = await client.createFile(
          commentsPath,
          content,
          `Add comments on ${fileName(path)}`,
        );
        setLocalSha(result.sha);
      }
      setIsDirty(false);
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
    } finally {
      setIsSaving(false);
    }
  }

  return {
    threads: localThreads ?? [],
    isLoading: Boolean(client) && (commentsQuery.isLoading || localThreads === null),
    isDirty,
    isSaving,
    addComment,
    addReply,
    resolveThread,
    saveComments,
  };
}
