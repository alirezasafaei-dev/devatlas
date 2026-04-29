#!/usr/bin/env node
import { existsSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);

const getArg = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? fallback : args[index + 1];
};

const hasFlag = (name) => args.includes(`--${name}`);

function runCommand(label, command, commandArgs, options = {}) {
  const runDry = Boolean(options.dryRun);
  console.log(`[staging-data] ${label}: ${command} ${commandArgs.join(' ')}`);

  if (runDry) {
    console.log('[staging-data] dry-run enabled, command not executed');
    return;
  }

  const result = spawnSync(command, commandArgs, {
    stdio: options.stdin ? ['pipe', 'inherit', 'inherit'] : 'inherit',
    input: options.stdin,
    env: {
      ...process.env,
      ...options.env,
    },
  });

  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function parseTimestampedBackupFile() {
  const now = new Date();
  const value = now.toISOString().replace(/[:.]/g, '-');
  return `./tmp/devatlas-staging-data-${value}.sql`;
}

function requireDatabaseUrl() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required for STAGING-DATA-01 rehearsal');
  }
  return databaseUrl;
}

function ensureTools(backupDryRun, restoreDryRun) {
  if (backupDryRun && restoreDryRun) {
    return;
  }
  const commands = ['pg_dump', 'psql'];
  for (const command of commands) {
    const result = spawnSync('command', ['-v', command], { stdio: 'pipe' });
    if (result.status !== 0) {
      throw new Error(`Required command not found: ${command}`);
    }
  }
}

function runSmoke(apiBaseUrl, smokeQuery, insecure) {
  const smokeArgs = ['search:smoke', '--', '--api', apiBaseUrl, '--query', smokeQuery];
  if (insecure) {
    smokeArgs.push('--insecure');
  }
  if (hasFlag('require-positive')) {
    smokeArgs.push('--require-positive');
  }

  runCommand('smoke-check', 'pnpm', smokeArgs);
}

function main() {
  const databaseUrl = requireDatabaseUrl();
  const apiBaseUrl = getArg('api', process.env.API_BASE_URL ?? 'https://staging.alirezasafeidev.ir');
  const smokeQuery = getArg('smoke-query', 'React');
  const contentDir = getArg(
    'content-dir',
    process.env.CONTENT_DIR ?? './packages/content/src/__tests__/fixtures',
  );
  const backupFile = getArg('backup-file', parseTimestampedBackupFile());
  const executeBackupRestore = hasFlag('execute-backup-restore');
  const insecure = hasFlag('insecure');
  const keepBackup = hasFlag('keep-backup');
  const seedDryRun = hasFlag('seed-dry-run');
  const smokeDryRun = hasFlag('smoke-dry-run');

  const backupDryRun = !executeBackupRestore;
  const restoreDryRun = !executeBackupRestore;

  ensureTools(backupDryRun, restoreDryRun);

  console.log('[staging-data] Context:');
  console.log(`[staging-data] api=${apiBaseUrl}`);
  console.log(`[staging-data] database=${databaseUrl}`);
  console.log(`[staging-data] contentDir=${contentDir}`);
  console.log(`[staging-data] backupFile=${backupFile}`);
  console.log(`[staging-data] backupDryRun=${backupDryRun}`);
  console.log(`[staging-data] restoreDryRun=${restoreDryRun}`);

  // Backup current DB
  if (!existsSync(dirname(backupFile))) {
    mkdirSync(dirname(backupFile), { recursive: true });
  }
  runCommand(
    'backup-current-data',
    'pg_dump',
    ['--no-owner', '--no-privileges', '--clean', `--file=${backupFile}`, databaseUrl],
    {
      dryRun: backupDryRun,
    },
  );

  // Seed with canonical content-backed flow
  if (!hasFlag('skip-seed')) {
    runCommand('seed-content', 'pnpm', ['--filter', '@devatlas/api', 'db:seed'], {
      env: { CONTENT_DIR: contentDir },
      dryRun: seedDryRun,
    });
  }

  // Post-seed validation
  if (!smokeDryRun) {
    runSmoke(apiBaseUrl, smokeQuery, insecure);
  }

  // Rollback rehearsal (plan + command-level readiness)
  runCommand('rollback-plan', 'pnpm', ['--filter', '@devatlas/api', 'db:rollback:plan']);

  // Restore dry-run by default; execute with --execute-backup-restore
  runCommand(
    'restore-from-backup',
    'psql',
    [databaseUrl],
    {
      dryRun: restoreDryRun,
      stdin: restoreDryRun ? undefined : readFileSync(backupFile),
    },
  );

  // Post-restore smoke to validate lifecycle completion
  if (!smokeDryRun) {
    runSmoke(apiBaseUrl, smokeQuery, insecure);
  }

  if (restoreDryRun || keepBackup) {
    return;
  }

  rmSync(backupFile, { force: true });
  console.log(`[staging-data] removed temporary backup ${backupFile}`);
}

try {
  main();
} catch (error) {
  console.error('[staging-data] failed:', error);
  process.exit(1);
}
