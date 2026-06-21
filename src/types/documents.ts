export interface DocumentNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: DocumentNode[];
}

export interface ReviewEntry {
  path: string;
  unresolvedCount: number;
}
