#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';

const argv = process.argv.slice(2);
const outputJson = argv.includes('--json') || argv.includes('-j');
const preferOffline = argv.includes('--low-token') ||
  process.env.AGENT_LOW_TOKEN_MODE === '1' ||
  process.env.AGENT_LOW_TOKEN_MODE === 'true';

function parseLocalEnv(filePath) {
  const env = new Map();
  if (!fs.existsSync(filePath)) return env;

  for (const raw of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || !line.includes('=')) {
      continue;
    }
    const idx = line.indexOf('=');
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim().replace(/^"|"$/g, '').replace(/^'|'$/g, '');
    if (key) env.set(key, value);
  }
  return env;
}

function runCommand(cmd) {
  const [command, ...args] = cmd.split(' ');
  const result = spawnSync(command, args, { stdio: 'inherit', encoding: 'utf8' });
  return { ok: result.status === 0, status: result.status, pid: result.pid };
}

function hasNetwork() {
  return fetch('https://api.github.com', { method: 'HEAD' })
    .then((res) => res.ok || res.status === 401)
    .catch(() => false);
}

async function main() {
  const env = parseLocalEnv('.env.local');
  const hasToken = Boolean(process.env.GITHUB_TOKEN || process.env.GH_TOKEN || env.get('GITHUB_TOKEN') || env.get('GH_TOKEN'));
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY || env.get('DEEPSEEK_API_KEY'));

  const vps = parseLocalEnv('.env.vps');
  const host = vps.get('VPS') || vps.get('VPSNAME');
  const keyPath = [vps.get('DEVATLAS_STAGING_KEY'), vps.get('SSH_KEY'), vps.get('KEY'), vps.get('VPS_KEY_PATH')].find(Boolean);
  const hasSshKey = keyPath && fs.existsSync(keyPath);

  const doctor = runCommand('pnpm doctor');
  const internet = (await hasNetwork()) ? 'online' : 'offline';

  const toolsSummary = {
    githubToken: hasToken,
    deepseek: hasDeepseek,
    toolchain: doctor.ok ? 'ready' : 'needs-fix',
    internet,
    vps: {
      host: Boolean(host),
      keyAvailable: Boolean(hasSshKey),
    },
  };

  const report = {
    timestamp: new Date().toISOString(),
    doctorOk: doctor.ok,
    toolsSummary,
    recommendedMode: 'offline',
    recommendedCommand: 'pnpm agent:auto:offline',
    recommendations: [
      'Run local checks with pnpm agent:auto:offline when token/network is limited.',
      'Run pnpm agent:tools --json for live capability matrix.',
      'Run pnpm agent:vps --json before any deploy step.',
    ],
  };

  if (internet === 'online') {
    if (!preferOffline) {
      report.recommendedMode = hasToken ? 'online' : 'offline';
      report.recommendedCommand = hasToken ? 'pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD' : 'pnpm agent:auto:offline';
    }
    if (!hasToken) {
      report.recommendations.unshift('No GitHub token detected: set GITHUB_TOKEN or GH_TOKEN for remote workflow checks.');
    }
    if (!hasDeepseek) {
      report.recommendations.unshift('DEEPSEEK_API_KEY not found; set it for DeepSeek review in agent:auto.');
    }
    if (!host || !hasSshKey) {
      report.recommendations.push('VPS preflight likely incomplete: verify host + SSH key settings in .env.vps.');
    }
  } else {
    report.toolsSummary.internet = 'offline';
  }

  if (preferOffline) {
    report.recommendations.unshift('Low-token mode active (AGENT_LOW_TOKEN_MODE=1): remote checks and DeepSeek calls are skipped.');
    report.recommendedMode = 'offline';
    report.recommendedCommand = 'pnpm agent:auto:offline';
  }

  if (outputJson) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(`[agent-preflight] ${report.timestamp}`);
  console.log(`doctor: ${doctor.ok ? 'ok' : 'fail'}`);
  console.log(`internet: ${report.toolsSummary.internet}`);
  console.log(`recommended mode: ${report.recommendedMode}`);
  console.log(`recommended command: ${report.recommendedCommand}`);
  for (const note of report.recommendations) {
    console.log(`- ${note}`);
  }
}

main().catch((error) => {
  console.error(`agent-preflight failed: ${error.message}`);
  process.exitCode = 1;
});
