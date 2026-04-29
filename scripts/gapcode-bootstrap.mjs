#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

function run(label, command, args) {
  console.error(`==> ${label}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: false });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const args = process.argv.slice(2);
const contextArgs = [];
for (let index = 0; index < args.length; index += 1) {
  const value = args[index];
  if (value === '--scope' || value === '--base-ref') {
    contextArgs.push(value);
    if (args[index + 1]) {
      contextArgs.push(args[index + 1]);
      index += 1;
    }
    continue;
  }
  if (value.startsWith('--scope=') || value.startsWith('--base-ref=')) {
    contextArgs.push(value);
    continue;
  }
  if (value === '--no-auto-scope') {
    contextArgs.push(value);
    continue;
  }
  if (!value.startsWith('--')) {
    contextArgs.push(value);
  }
}

run('Generate repo metadata', 'pnpm', ['gapcode:index']);
run('Generate repo metrics', 'pnpm', ['gapcode:index:metrics']);
run('Generate context manifest', 'pnpm', ['gapcode:context', ...contextArgs]);
run('Verify context manifest', 'pnpm', ['gapcode:verify']);
run('Generate context metrics', 'pnpm', ['gapcode:metrics']);
