export interface ProposalNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: ProposalNode[];
}
