export interface TreeItem {
  path: string;
  type: 'blob' | 'tree';
}

export interface FileContent {
  content: string;
  sha: string;
}

export interface User {
  login: string;
  avatarUrl: string;
}

export interface CommitInfo {
  author: User;
  date: string;
  message: string;
}

export interface RateLimitInfo {
  remaining: number;
  limit: number;
  reset: Date;
}
