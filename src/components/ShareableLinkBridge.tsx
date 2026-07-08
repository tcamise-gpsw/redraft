import { useEffect, useRef } from 'react';

import { useAuth } from '../hooks/useAuth';
import { useShareableLink } from '../hooks/useShareableLink';

export function ShareableLinkBridge() {
  const { repo, branch, updateRepo, setBranch } = useAuth();
  const { urlRepo, urlBranch } = useShareableLink();
  const appliedRef = useRef(false);

  useEffect(() => {
    if (appliedRef.current) {
      return;
    }

    appliedRef.current = true;

    if (
      urlRepo &&
      (repo?.owner !== urlRepo.owner || repo.repo !== urlRepo.repo)
    ) {
      updateRepo(
        urlRepo.owner,
        urlRepo.repo,
        undefined,
        urlBranch ?? undefined,
      );
      return;
    }

    if (urlBranch && branch !== urlBranch) {
      setBranch(urlBranch);
    }
  }, [branch, repo, setBranch, updateRepo, urlBranch, urlRepo]);

  return null;
}
