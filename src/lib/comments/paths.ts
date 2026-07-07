const COMMENTS_ROOT = '.redraft/comments';

export function sanitizeBranch(branch: string): string {
  return branch.replaceAll('/', '--');
}

export function commentPath(docPath: string, docBranch: string): string {
  return `${COMMENTS_ROOT}/${sanitizeBranch(docBranch)}/${docPath.replace(/\.md$/u, '.comments.json')}`;
}
