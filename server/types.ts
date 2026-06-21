export interface TreeEntry {
  path: string;
  type: 'blob';
}

export class FileOperationError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'FileOperationError';
    this.status = status;
  }
}
