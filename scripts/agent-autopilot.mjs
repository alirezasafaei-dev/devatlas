#!/usr/bin/env node

import { execSync } from 'node:child_process';

const isLowTokenMode = (() => {
  const value = process.env.AGENT_LOW_TOKEN_MODE;
  return value === '1' || String(value).toLowerCase() === 'true';
})();

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  execSync(cmd, { stdio: 'inherit', encoding: 'utf8' });
}

if (isLowTokenMode) {
  console.log('• Low-token mode active: skipping remote GitHub/remote inventory checks.');
}

run('pnpm doctor', 'Doctor check');

if (!isLowTokenMode) {
  run('pnpm agent:github status --json', 'GitHub status');
  run('pnpm agent:inventory --json', 'Agent inventory');
} else {
  console.log('ℹ GitHub/inventory checks skipped in low-token mode.');
}
