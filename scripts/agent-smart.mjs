#!/usr/bin/env node
// filepath: scripts/agent-smart.mjs

import { execSync } from 'node:child_process';

const argv = process.argv.slice(2);

function hasFlag(name) {
  return argv.includes(`--${name}`) || argv.includes(`-${name}`);
}

function getArg(name, fallback = null) {
  const prefix = `--${name}=`;
  for (const arg of argv) {
    if (arg.startsWith(prefix)) {
      return arg.slice(prefix.length);
    }
  }
  return fallback;
}

function parseBool(raw, fallback = false) {
  if (raw === null || raw === undefined) return fallback;
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(raw).toLowerCase());
}

async function hasNetworkAccess() {
  const timeout = Number.parseInt(process.env.DEVOPS_NETWORK_TIMEOUT_MS || '1200', 10);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch('https://api.github.com', {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'User-Agent': 'devatlas-agent-smart',
      },
    });

    clearTimeout(timer);
    return response.ok || response.status === 401;
  } catch {
    return false;
  }
}

function run(cmd, label, options = { inherit: true }) {
  console.log(`\n▶ ${label}`);
  execSync(cmd, {
    stdio: options.inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
  });
}

function info(message) {
  console.log(`• ${message}`);
}

function warn(message) {
  console.log(`⚠ ${message}`);
}

async function main() {
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log('Usage: node scripts/agent-smart.mjs [--offline] [--smoke] [--deepseek] [--full] [--deepseek-diff=range] [--deepseek-file=path] [--no-api] [--json]');
    console.log('');
    console.log('Default flow: doctor -> lint/typecheck/test -> test:web/api (light)');
    console.log('--offline         skip network-dependent steps');
    console.log('--smoke           run pnpm search:smoke');
    console.log('--deepseek        run DeepSeek review (if token and network available)');
    console.log('--full            include verify:api + verify:web in addition to light checks');
    console.log('--deepseek-diff   diff range for pnpm agent:deepseek');
    console.log('--deepseek-file   file path for pnpm agent:deepseek');
    console.log('--no-api          skip agent:github + agent:inventory');
    console.log('--json            compact JSON output');
    process.exit(0);
  }

  const offlineMode = parseBool(getArg('offline'), false) || hasFlag('offline');
  const includeSmoke = parseBool(getArg('smoke'), false) || hasFlag('smoke');
  const includeDeepseek = parseBool(getArg('deepseek'), false) || hasFlag('deepseek');
  const includeDeepDive = parseBool(getArg('full'), false) || hasFlag('full');
  const outputJson = hasFlag('json');
  const noApi = parseBool(getArg('no-api'), false) || hasFlag('no-api');

  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY);
  const hasGitHubToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  const isCI = Boolean(process.env.CI);

  const networkOk = !offlineMode ? await hasNetworkAccess() : false;

  if (offlineMode) {
    info('offline mode: local-only checks');
  }

  const steps = [];

  try {
    run('pnpm doctor', 'Doctor check');
    steps.push('doctor:ok');

    run('pnpm lint:api', 'Lint API');
    run('pnpm lint:web', 'Lint Web');
    steps.push('lint:api+web:ok');

    run('pnpm typecheck:api', 'Typecheck API');
    run('pnpm typecheck:web', 'Typecheck Web');
    steps.push('typecheck:api+web:ok');

    run('pnpm test:api', 'Test API');
    run('pnpm test:web', 'Test Web');
    steps.push('tests:api+web:ok');

    if (includeDeepDive || includeSmoke) {
      run('pnpm verify:api', 'API verification');
      run('pnpm verify:web', 'Web verification');
      steps.push('verify:full:ok');
    }

    if (!noApi && includeSmoke) {
      run('pnpm search:smoke', 'Search smoke');
      steps.push('smoke:ok');
    }

    if (!isCI) {
      run('pnpm agent:github status --json', 'GitHub status (local + remote if token)');
      steps.push('github:status:ok');
      run('pnpm agent:inventory', 'Automation inventory');
      steps.push('inventory:ok');
    }

    if (includeDeepseek && networkOk && hasDeepseek && !isCI) {
      const diff = getArg('deepseek-diff', 'staged') || 'staged';
      const file = getArg('deepseek-file', '');
      const deepCmd = file
        ? `pnpm agent:deepseek --file ${JSON.stringify(file)} --json`
        : `pnpm agent:deepseek --diff ${JSON.stringify(diff)} --json`;

      run(deepCmd, 'DeepSeek review');
      steps.push('deepseek:ok');
    } else if (includeDeepseek) {
      if (!hasDeepseek) {
        warn('DeepSeek skipped: DEEPSEEK_API_KEY is missing.');
      } else if (!networkOk) {
        warn('DeepSeek skipped: no network detected.');
      } else if (isCI) {
        warn('DeepSeek skipped: CI mode.');
      }
      steps.push('deepseek:skipped');
    }

    if (outputJson) {
      console.log(JSON.stringify({ status: 'ok', steps }, null, 2));
    } else {
      console.log('\n✓ agent-smart completed');
      console.log(JSON.stringify({ status: 'ok', steps }, null, 2));
    }
    return;
  } catch (err) {
    if (outputJson) {
      console.log(JSON.stringify({ status: 'failed', steps, reason: String(err.message) }, null, 2));
    } else {
      console.error(`\n✗ agent-smart failed: ${err.message}`);
      console.log(JSON.stringify({ status: 'failed', steps, reason: String(err.message) }, null, 2));
    }
    process.exitCode = 1;
  }
}

main().catch((err) => {
  if (hasFlag('json')) {
    console.log(JSON.stringify({ status: 'failed', reason: String(err.message) }, null, 2));
  } else {
    console.error(`\n✗ agent-smart crashed: ${err.message}`);
  }
  process.exitCode = 1;
});
