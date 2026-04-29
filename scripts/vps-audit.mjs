#!/usr/bin/env node

import { execSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const argv = process.argv.slice(2);
const outputJson = argv.includes('--json') || argv.includes('-j');

const ENV_FILES = ['.env.vps', '.env.local', '.env'];
const ROOT_DIR = process.cwd();

function parseEnv(filePath) {
  const env = new Map();
  if (!fs.existsSync(filePath)) return env;

  for (const rawLine of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (!key) continue;
    env.set(key, value);
  }
  return env;
}

function readEnvChain(files) {
  const merged = new Map();
  for (const file of files) {
    const data = parseEnv(path.join(ROOT_DIR, file));
    for (const [key, value] of data.entries()) {
      merged.set(key, value);
    }
  }
  return (key) => process.env[key] || merged.get(key);
}

function hasCommand(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'pipe', encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function runCommand(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    encoding: 'utf8',
    timeout: options.timeoutMs ?? 8000,
    stdio: 'pipe',
    ...options,
  });
  return result;
}

function checkTcp(host, port) {
  const timeout = 4000;
  if (!hasCommand('nc')) {
    return { status: 'skipped', detail: 'nc not available' };
  }
  const res = runCommand('nc', ['-z', '-w', String(timeout / 1000), host, String(port)], { stdio: 'ignore' });
  return res.status === 0
    ? { status: 'ok', detail: 'tcp reachable' }
    : { status: 'fail', detail: `nc exit=${res.status}` };
}

async function run() {
  const envValue = readEnvChain(ENV_FILES);

  const host = envValue('VPS') || envValue('VPSNAME');
  const port = Number.parseInt(envValue('PORT') || '22', 10);
  const user = envValue('DEPLOYUSER') || envValue('DEVATLAS_STAGING_USER') || envValue('USER') || 'deploy';
  const keyCandidates = [
    envValue('DEVATLAS_STAGING_KEY'),
    envValue('SSH_KEY'),
    envValue('KEY'),
    envValue('VPS_KEY_PATH'),
    '/home/dev/.ssh/id_ed25519',
    '/home/dev/.ssh/id_rsa',
  ];
  const password = envValue('PASSWORD');

  const keyPath = keyCandidates.find((candidate) => candidate && fs.existsSync(candidate));
  const hasSsh = hasCommand('ssh');
  const hasDocker = hasCommand('docker');
  const hasPsql = hasCommand('psql');

  const report = {
    timestamp: new Date().toISOString(),
    host: host || null,
    port: Number.isNaN(port) ? 22 : port,
    user: user || null,
    keyAvailable: Boolean(keyPath),
    hasPasswordInEnv: Boolean(password),
    checks: [],
    recommendations: [],
    canRunDeploy: false,
  };

  if (!host) {
    report.checks.push({ label: 'host', status: 'missing', detail: 'No VPS/VPSNAME in env files' });
    report.recommendations.push('Set VPS or VPSNAME in .env.vps/.env.local/.env');
    print(report, outputJson);
    return;
  }

  if (!hasSsh) {
    report.checks.push({ label: 'ssh', status: 'missing', detail: 'ssh command not found' });
    report.recommendations.push('Install OpenSSH client on local machine');
  } else {
    report.checks.push({ label: 'ssh', status: 'ok', detail: 'ssh available' });
  }

  report.checks.push({ label: 'docker local', status: hasDocker ? 'ok' : 'missing', detail: hasDocker ? 'docker is available' : 'install docker for local diagnostics' });
  report.checks.push({ label: 'psql local', status: hasPsql ? 'ok' : 'missing', detail: hasPsql ? 'psql is available' : 'install PostgreSQL client for DB checks' });

  const tcp = checkTcp(host, port);
  report.checks.push({ label: 'tcp 22 reachability', status: tcp.status, detail: tcp.detail });

  if (hasSsh) {
    const baseArgs = [
      '-o', 'BatchMode=yes',
      '-o', `ConnectTimeout=5`,
      '-o', 'StrictHostKeyChecking=no',
      '-p', String(Number.isNaN(port) ? 22 : port),
      `${user}@${host}`,
      'echo VPS_AUDIT_OK; command -v docker >/dev/null && docker --version || true; command -v node >/dev/null && node -v || true; command -v psql >/dev/null && psql --version || true; command -v pnpm >/dev/null && pnpm -v || true; command -v bash >/dev/null && echo HAS_BASH=1 || true; [ -x /var/www/devatlas/shared/scripts/deploy-staging.sh ] && echo HAS_DEPLOY_SCRIPT=1 || echo HAS_DEPLOY_SCRIPT=0; [ -x /var/www/devatlas/shared/env/staging.env ] && echo HAS_STAGING_ENV=1 || echo HAS_STAGING_ENV=0; df -h / | tr -s \' \' \';\''
    ];

    if (keyPath) {
      baseArgs.splice(0, 0, '-i', keyPath);
    }

    const authMode = keyPath ? `key=${path.basename(keyPath)}` : (password ? 'password-present(ignored)' : 'no-key/no-auth');
    report.checks.push({ label: 'ssh auth', status: keyPath ? 'key_configured' : (password ? 'password_present_no_key' : 'missing_method') , detail: authMode });

    if (keyPath) {
      const sshResult = runCommand('ssh', baseArgs, { timeoutMs: 12000, stdio: ['ignore', 'pipe', 'pipe'] });
      const remoteOut = (sshResult.stdout || '').trim();
      const remoteErr = (sshResult.stderr || '').trim();

      if (sshResult.status === 0 && remoteOut.includes('VPS_AUDIT_OK')) {
        report.checks.push({ label: 'remote command', status: 'ok', detail: 'ssh exec succeeded' });
        const remoteStats = remoteOut.split('\n').filter(Boolean).map((line) => line.trim());
        report.remote = {
          raw: remoteStats,
          hasDeployScript: remoteStats.some((line) => line === 'HAS_DEPLOY_SCRIPT=1'),
          hasStagingEnv: remoteStats.some((line) => line === 'HAS_STAGING_ENV=1'),
          dockerDetected: remoteStats.some((line) => line.includes('Docker version')),
        };
      } else {
        report.checks.push({
          label: 'remote command',
          status: 'failed',
          detail: (remoteErr || remoteOut || 'ssh command failed').slice(0, 240),
        });
      }
    } else {
      report.checks.push({ label: 'remote command', status: 'skipped', detail: 'No private key configured for non-interactive ssh check' });
    }
  }

  report.canRunDeploy = report.checks.every((check) => check.status !== 'missing' && check.status !== 'failed');
  report.canRunDeploy = Boolean(report.canRunDeploy && report.host && hasSsh && (report.keyAvailable || password));

  if (!report.canRunDeploy) {
    report.recommendations.push('Set a reachable SSH key in .env.vps or .env.local and verify host/key mapping.');
  } else {
    report.recommendations.push('VPS deploy preflight passed; can run pnpm deploy:staging -- --insecure --skip-deploy or full deploy with caution.');
  }

  if (report.remote?.hasStagingEnv === false) {
    report.recommendations.push('Remote staging.env file is missing; create /var/www/devatlas/shared/env/staging.env before production-like runs.');
  }
  if (report.remote && report.remote.dockerDetected !== true) {
    report.recommendations.push('Docker was not detected remotely; verify container tooling before remote deploy/compose steps.');
  }

  print(report, outputJson);
}

function print(report, outputJson) {
  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`host=${report.host || 'n/a'}:${report.port}`);
  console.log(`ssh-key=${report.keyAvailable ? 'configured' : 'missing'} user=${report.user}`);
  console.log(`canRunDeploy=${report.canRunDeploy}`);
  for (const check of report.checks) {
    console.log(`- ${check.label}: ${check.status} (${check.detail})`);
  }
  if (report.recommendations.length) {
    console.log('Recommendations:');
    for (const item of report.recommendations) {
      console.log(`- ${item}`);
    }
  }
}

run().catch((error) => {
  console.error('vps-audit failed:', error.message);
  process.exitCode = 1;
});
