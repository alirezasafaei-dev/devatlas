#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);

function getArg(name, fallback = undefined) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) {
    return fallback;
  }

  return args[index + 1];
}

function hasFlag(name) {
  return args.includes(`--${name}`);
}

function run(command, commandArgs, options = {}) {
  console.log(`[deploy:staging] $ ${command} ${commandArgs.join(' ')}`);
  execFileSync(command, commandArgs, {
    stdio: 'inherit',
    ...options,
  });
}

function runOptional(command, commandArgs, label) {
  try {
    run(command, commandArgs);
    return true;
  } catch {
    console.log(`[deploy:staging] optional check skipped: ${label}`);
    return false;
  }
}

function runGit(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

const host = getArg('host', process.env['DEVATLAS_STAGING_HOST'] ?? '185.3.124.93');
const user = getArg('user', process.env['DEVATLAS_STAGING_USER'] ?? 'deploy');
const keyPath = getArg('key', process.env['DEVATLAS_STAGING_KEY'] ?? '/home/dev/.ssh/id_ed25519');
const remoteScript = getArg(
  'remote-script',
  process.env['DEVATLAS_STAGING_REMOTE_SCRIPT'] ?? '/var/www/devatlas/shared/scripts/deploy-staging.sh',
);
const targetRef = getArg('ref', process.env['DEVATLAS_TARGET_REF'] ?? '');
const smokeUrl = getArg(
  'smoke-url',
  process.env['DEVATLAS_SMOKE_BASE_URL'] ?? 'https://staging.alirezasafeidev.ir',
);
const syncRemote = hasFlag('sync-remote') ? '1' : process.env['DEVATLAS_SYNC_REMOTE'] ?? '0';
const skipDeploy = hasFlag('skip-deploy');
const insecure = hasFlag('insecure');
const smokeQuery = getArg('smoke-query', process.env['DEVATLAS_SMOKE_QUERY'] ?? 'React');
const releaseLabel = getArg('release-label', process.env['DEVATLAS_RELEASE_LABEL'] ?? 'staging-deploy');
const commitRef = targetRef || runGit(['rev-parse', 'HEAD']);
const shortCommit = runGit(['rev-parse', '--short', commitRef]);
const commitMessage = runGit(['log', '-1', '--pretty=format:%s', commitRef]);

const sshArgs = [
  '-i',
  keyPath,
  '-o',
  'IdentitiesOnly=yes',
  '-o',
  'StrictHostKeyChecking=no',
  `${user}@${host}`,
];

if (!skipDeploy) {
  const remoteCommand = [
    `export DEVATLAS_SYNC_REMOTE=${JSON.stringify(syncRemote)}`,
    `export DEVATLAS_SMOKE_BASE_URL=${JSON.stringify(smokeUrl)}`,
    `export DEVATLAS_RELEASE_LABEL=${JSON.stringify(releaseLabel)}`,
    `export DEVATLAS_RELEASE_COMMIT=${JSON.stringify(shortCommit)}`,
    `export DEVATLAS_RELEASE_SHA=${JSON.stringify(commitRef)}`,
    `export DEVATLAS_RELEASE_MESSAGE=${JSON.stringify(commitMessage)}`,
    targetRef ? `export DEVATLAS_TARGET_REF=${JSON.stringify(targetRef)}` : '',
    remoteScript,
  ]
    .filter(Boolean)
    .join('; ');

  run('ssh', [...sshArgs, remoteCommand]);
}

console.log('[deploy:staging] release context:');
console.log(`[deploy:staging] label=${releaseLabel}`);
console.log(`[deploy:staging] commit=${shortCommit}`);
console.log(`[deploy:staging] message=${commitMessage}`);

const curlArgs = ['-fsS'];
if (insecure) {
  curlArgs.push('-k');
}

run('curl', [...curlArgs, `${smokeUrl}/api/v1/health/live`]);
run('curl', [...curlArgs, `${smokeUrl}/api/v1/health/ready`]);
run('curl', [...curlArgs, smokeUrl]);
run('curl', [...curlArgs, `${smokeUrl}/api/v1/health`]);
runOptional('curl', [...curlArgs, `${smokeUrl}/api/v1/health/metrics`], '/api/v1/health/metrics');

const smokeArgs = ['search:smoke', '--', '--api', smokeUrl, '--query', smokeQuery];
if (insecure) {
  smokeArgs.push('--insecure');
}
run('pnpm', smokeArgs);

console.log('[deploy:staging] pass');
