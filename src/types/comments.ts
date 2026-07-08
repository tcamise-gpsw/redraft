export interface Author {
  login: string;
  avatarUrl: string;
}

export interface CommentReply {
  id: string;
  author: Author;
  body: string;
  createdAt: string;
}

export interface CommentThread {
  id: string;
  quote: string;
  quoteContext: {
    prefix: string;
    suffix: string;
  };
  offset: number;
  author: Author;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: CommentReply[];
}

export interface CommentFile {
  version: 1;
  comments: CommentThread[];
}
