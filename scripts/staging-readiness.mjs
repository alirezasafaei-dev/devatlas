#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const args = process.argv.slice(2);

const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const hasFlag = (name) => args.includes(`--${name}`);

function parseTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function runCommand(label, command, commandArgs, env = process.env, dryRun = false) {
  const commandLine = `${command} ${commandArgs.join(' ')}`;
  console.log(`[staging-readiness] ${label}: ${commandLine}`);

  if (dryRun) {
    console.log('[staging-readiness] dry-run enabled, command not executed');
    return true;
  }

  const result = spawnSync(command, commandArgs, {
    stdio: 'inherit',
    env,
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }

  return true;
}

function buildDeployArgs() {
  const deployArgs = ['deploy:staging', '--'];
  const releaseLabel = getArg('release-label', 'staging-readiness');
  const smokeQuery = getArg('smoke-query', 'React');
  const apiBaseUrl = getArg('api', process.env.DEVATLAS_SMOKE_BASE_URL ?? 'https://staging.alirezasafeidev.ir');

  deployArgs.push('--smoke-query', smokeQuery);
  deployArgs.push('--smoke-url', apiBaseUrl);
  deployArgs.push('--release-label', releaseLabel);

  if (hasFlag('sync-remote')) {
    deployArgs.push('--sync-remote');
  }
  if (hasFlag('insecure')) {
    deployArgs.push('--insecure');
  }
  if (hasFlag('skip-deploy')) {
    deployArgs.push('--skip-deploy');
  }

  const ref = getArg('ref');
  if (ref) {
    deployArgs.push('--ref', ref);
  }

  const host = getArg('host');
  if (host) {
    deployArgs.push('--host', host);
  }

  const user = getArg('user');
  if (user) {
    deployArgs.push('--user', user);
  }

  const key = getArg('key');
  if (key) {
    deployArgs.push('--key', key);
  }

  return deployArgs;
}

function buildDataArgs() {
  const dataArgs = ['staging:data', '--'];
  const apiBaseUrl = getArg('api', process.env.DEVATLAS_SMOKE_BASE_URL ?? 'https://staging.alirezasafeidev.ir');
  const smokeQuery = getArg('smoke-query', 'React');
  const contentDir = getArg('content-dir', process.env.CONTENT_DIR ?? './packages/content/src/__tests__/fixtures');
  const backupFile = getArg('backup-file');
  const executeBackupRestore = hasFlag('execute-backup-restore');
  const keepBackup = hasFlag('keep-backup');
  const seedDryRun = hasFlag('seed-dry-run');
  const smokeDryRun = hasFlag('smoke-dry-run');

  dataArgs.push('--api', apiBaseUrl);
  dataArgs.push('--smoke-query', smokeQuery);
  dataArgs.push('--content-dir', contentDir);

  if (backupFile) {
    dataArgs.push('--backup-file', backupFile);
  }
  if (executeBackupRestore) {
    dataArgs.push('--execute-backup-restore');
  }
  if (keepBackup) {
    dataArgs.push('--keep-backup');
  }
  if (seedDryRun) {
    dataArgs.push('--seed-dry-run');
  }
  if (smokeDryRun) {
    dataArgs.push('--smoke-dry-run');
  }
  if (hasFlag('require-positive')) {
    dataArgs.push('--require-positive');
  }
  if (hasFlag('insecure')) {
    dataArgs.push('--insecure');
  }

  return dataArgs;
}

function buildManifestPath(releaseLabel, shortCommit, artifactDir, artifactFileOverride) {
  if (artifactFileOverride) {
    return resolve(artifactFileOverride);
  }

  return resolve(artifactDir, `${releaseLabel}-${shortCommit}-${parseTimestamp()}.json`);
}

function runGit(argList) {
  const result = spawnSync('git', argList, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  if (result.status !== 0) {
    throw new Error(`git ${argList.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }

  return String(result.stdout).trim();
}

function main() {
  const releaseLabel = getArg('release-label', 'staging-readiness');
  const shortCommit = runGit(['rev-parse', '--short', 'HEAD']);
  const longCommit = runGit(['rev-parse', 'HEAD']);
  const commitMessage = runGit(['log', '-1', '--pretty=format:%s', longCommit]);
  const apiBaseUrl = getArg('api', process.env.DEVATLAS_SMOKE_BASE_URL ?? 'https://staging.alirezasafeidev.ir');
  const smokeQuery = getArg('smoke-query', 'React');
  const skipData = hasFlag('skip-data-rehearsal');
  const executeBackupRestore = hasFlag('execute-backup-restore');
  const keepDatabaseBackup = hasFlag('keep-backup');
  const databaseUrl = hasFlag('skip-data-rehearsal')
    ? undefined
    : getArg('database-url', process.env.DATABASE_URL);
  const dryRun = hasFlag('dry-run');
  const artifactDir = getArg('artifact-dir', './tmp/staging-readiness');
  const artifactFile = getArg('artifact-file');

  const artifactBase = artifactDir;

  if (!existsSync(artifactBase)) {
    mkdirSync(artifactBase, { recursive: true });
  }

  const manifestPath = buildManifestPath(
    releaseLabel,
    shortCommit,
    artifactBase,
    artifactFile,
  );

  console.log('[staging-readiness] Context:');
  console.log(`[staging-readiness] api=${apiBaseUrl}`);
  console.log(`[staging-readiness] smokeQuery=${smokeQuery}`);
  console.log(`[staging-readiness] skipDataRehearsal=${skipData}`);
  console.log(`[staging-readiness] executeBackupRestore=${executeBackupRestore}`);
  console.log(`[staging-readiness] keepDatabaseBackup=${keepDatabaseBackup}`);
  console.log(`[staging-readiness] artifact=${manifestPath}`);

  const manifest = {
    startedAt: new Date().toISOString(),
    dryRun,
    apiBaseUrl,
    smokeQuery,
    skipDataRehearsal: skipData,
    executeBackupRestore,
    keepDatabaseBackup,
    release: {
      label: releaseLabel,
      commit: longCommit,
      shortCommit,
      message: commitMessage,
    },
    steps: [],
  };

  const finish = (status = 'pass') => {
    manifest.endedAt = new Date().toISOString();
    manifest.status = status;
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`[staging-readiness] manifest=${manifestPath}`);
  };

  if (!skipData && !databaseUrl) {
    throw new Error('DATABASE_URL is required for staging-data rehearsal (omit with --skip-data-rehearsal).');
  }

  // 1) Run the canonical staging deployment helper
  manifest.steps.push({
    name: 'deploy-staging',
    command: ['pnpm', ...buildDeployArgs()].join(' '),
    status: 'pending',
  });
  const deployArgs = buildDeployArgs();
  runCommand('deploy-staging', 'pnpm', deployArgs, process.env, dryRun);
  manifest.steps[0].status = 'pass';

  // 2) Run staging data lifecycle rehearsal for the same API surface
  if (!skipData) {
    const dataArgs = buildDataArgs();
    manifest.steps.push({
      name: 'staging-data',
      command: ['pnpm', ...dataArgs].join(' '),
      status: 'pending',
    });
    runCommand('data-rehearsal', 'pnpm', dataArgs, {
      ...process.env,
      DATABASE_URL: databaseUrl,
    }, dryRun);
    manifest.steps[1].status = 'pass';
  }

  finish('pass');
}

try {
  main();
} catch (error) {
  try {
    // best effort manifest write for troubleshooting
    const fallbackPath = resolve(process.cwd(), 'tmp', `staging-readiness-fail-${parseTimestamp()}.json`);
    if (!existsSync(resolve('tmp'))) {
      mkdirSync(resolve('tmp'), { recursive: true });
    }
    writeFileSync(fallbackPath, `${JSON.stringify({
      status: 'fail',
      error: error instanceof Error ? error.message : String(error),
      finishedAt: new Date().toISOString(),
    }, null, 2)}\n`);
    console.error(`[staging-readiness] failure manifest=${fallbackPath}`);
  } catch {
    // ignore best effort failure to keep original error visible
  }
  console.error('[staging-readiness] failed:', error);
  process.exit(1);
}
