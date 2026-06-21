import { useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import { ConflictError, GitHubClient } from '../lib/github';
import { getApiBaseUrl } from '../lib/mode';
import { useAuth } from './useAuth';
import { useToast } from './useToast';

export function useProposalEdit(path: string) {
  const { pat, repo } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const client = useMemo(() => {
    if (!pat || !repo) {
      return null;
    }

    return new GitHubClient({ pat, owner: repo.owner, repo: repo.repo, baseUrl: getApiBaseUrl() });
  }, [pat, repo]);

  async function save(content: string, sha: string): Promise<void> {
    if (!client) {
      throw new Error('Authentication is required');
    }

    try {
      await client.updateFile(
        path,
        content,
        sha,
        `Update proposal: ${path.split('/').at(-1) ?? path}`,
      );
      await queryClient.invalidateQueries({
        queryKey: ['proposal', path, 'content'],
      });
      await queryClient.invalidateQueries({
        queryKey: ['proposal', path, 'commit'],
      });
      navigate(`/${path.replace(/^proposals\//, 'proposals/')}`);
      showToast({ tone: 'info', title: 'Proposal saved' });
    } catch (error) {
      if (
        error instanceof ConflictError ||
        (error instanceof Error && /sha|conflict/i.test(error.message))
      ) {
        showToast({
          tone: 'error',
          title:
            'File was modified since you loaded it. Please refresh and re-apply your changes.',
        });
        return;
      }

      showToast({
        tone: 'error',
        title:
          error instanceof Error ? error.message : 'Unable to save proposal',
      });
    }
  }

  return {
    save,
  };
}
