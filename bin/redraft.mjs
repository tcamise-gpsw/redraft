#!/usr/bin/env node
import(new URL('../dist-server/cli.mjs', import.meta.url)).catch((err) => {
  console.error('Failed to start redraft:', err.message);
  process.exit(1);
});
