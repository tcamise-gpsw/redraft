import { exec } from 'node:child_process';
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { Command } from 'commander';

import { startWatcher } from './fs/watcher.js';
import { resolveUiRoot, startReDraftServer, verifyUiBuild } from './app.js';

interface ServeOptions {
  port?: number;
  open?: boolean;
  noUi?: boolean;
  host?: string;
}

async function ensureDirectoryExists(path: string): Promise<void> {
  const fileStats = await stat(path);
  if (!fileStats.isDirectory()) {
    throw new Error(`Not a directory: ${path}`);
  }
}

function browserOpenCommand(url: string): string {
  if (process.platform === 'darwin') {
    return `open ${JSON.stringify(url)}`;
  }

  if (process.platform === 'win32') {
    return `start "" ${JSON.stringify(url)}`;
  }

  return `xdg-open ${JSON.stringify(url)}`;
}

function triggerBrowserOpen(url: string): void {
  exec(browserOpenCommand(url));
}

async function runServe(
  directory = './proposals',
  options: ServeOptions = {},
): Promise<void> {
  const basePath = resolve(directory);
  await ensureDirectoryExists(basePath);

  const uiRoot = resolveUiRoot();
  if (!options.noUi) {
    await verifyUiBuild(uiRoot);
  }

  const runningServer = await startReDraftServer({
    basePath,
    uiRoot,
    noUi: options.noUi,
    host: options.host,
    port: options.port,
  });

  const stopWatcher = startWatcher(basePath, (event) => {
    runningServer.hub.broadcast(event);
  });

  console.log(`ReDraft local server listening at ${runningServer.url}`);

  if (options.open) {
    triggerBrowserOpen(runningServer.url);
  }

  const shutdown = async (exitCode = 0) => {
    stopWatcher();
    await runningServer.close();
    process.exit(exitCode);
  };

  process.once('SIGINT', () => {
    void shutdown();
  });
  process.once('SIGTERM', () => {
    void shutdown();
  });
}

function registerServeOptions(command: Command): Command {
  return command
    .option('--port <number>', 'Port to listen on (default: 4200)', (value) =>
      Number(value),
    )
    .option('--open', 'Open the ReDraft UI in the default browser', false)
    .option('--no-ui', 'Skip serving the static frontend', false)
    .option(
      '--host <string>',
      'Bind address (default: 127.0.0.1)',
      '127.0.0.1',
    );
}

const program = registerServeOptions(
  new Command()
    .name('redraft')
    .description('ReDraft local tooling')
    .argument('[directory]', 'proposal directory for the default serve command')
    .action(async function (this: Command, directory: string | undefined) {
      if (!directory) {
        program.help();
        return;
      }

      try {
        await runServe(directory, this.optsWithGlobals<ServeOptions>());
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }),
);

registerServeOptions(
  program
    .command('serve')
    .argument('[directory]', 'proposal directory')
    .action(async function (this: Command, directory: string | undefined) {
      try {
        await runServe(
          directory ?? './proposals',
          this.optsWithGlobals<ServeOptions>(),
        );
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error));
        process.exit(1);
      }
    }),
);

program.parse(process.argv);
