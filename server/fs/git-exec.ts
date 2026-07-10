import { spawnSync } from 'node:child_process';

export interface GitExecError extends Error {
  code: number | null;
  stderr: string;
  stdout: Buffer;
}

interface ExecGitOptions {
  env?: NodeJS.ProcessEnv;
}

async function execGitBufferInternal(
  cwd: string,
  args: string[],
  options: ExecGitOptions = {},
): Promise<Buffer> {
  const result = spawnSync('git', args, {
    cwd,
    env: options.env,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout ?? Buffer.alloc(0);
  const stderr = result.stderr?.toString('utf8') ?? '';
  if (result.status !== 0) {
    const error = new Error(
      stderr.trim() ||
        `git ${args.join(' ')} exited with code ${result.status}`,
    ) as GitExecError;
    error.code = result.status;
    error.stderr = stderr;
    error.stdout = stdout;
    throw error;
  }

  return stdout;
}

export async function execGitBuffer(
  cwd: string,
  args: string[],
  options: ExecGitOptions = {},
): Promise<Buffer> {
  return execGitBufferInternal(cwd, args, options);
}

export async function execGitText(
  cwd: string,
  args: string[],
  options: ExecGitOptions = {},
): Promise<string> {
  return (await execGitBufferInternal(cwd, args, options)).toString('utf8');
}
