#!/usr/bin/env node
// filepath: scripts/agent-ops.mjs

import { execSync } from 'node:child_process';
import fs from 'node:fs';

const argv = process.argv.slice(2);

const options = {
  smoke: argv.includes('--smoke'),
  skipVerify: argv.includes('--skip-verify'),
  skipDoctor: argv.includes('--skip-doctor'),
  skipGithub: argv.includes('--skip-github'),
  skipDeepseek: argv.includes('--skip-deepseek'),
  deepseek: argv.includes('--deepseek'),
  deepseekFile: null,
  deepseekDiff: null,
  outputJson: argv.includes('--json'),
  reportPath: null,
};

for (const arg of argv) {
  if (arg === '--help' || arg === '-h') {
    printHelp();
    process.exit(0);
  }
  if (arg.startsWith('--deepseek-file=')) {
    options.deepseek = true;
    options.deepseekFile = arg.slice('--deepseek-file='.length);
  }
  if (arg.startsWith('--deepseek-diff=')) {
    options.deepseek = true;
    options.deepseekDiff = arg.slice('--deepseek-diff='.length);
  }
  if (arg.startsWith('--report=')) {
    options.reportPath = arg.slice('--report='.length).trim();
  }
}

function printHelp() {
  console.log(`Usage: pnpm agent:ops [--smoke] [--deepseek] [--deepseek-file=path] [--deepseek-diff=range] [--skip-verify] [--skip-doctor] [--skip-github] [--skip-deepseek] [--report=path] [--json] [--help]`);
  console.log('');
  console.log('Default flow: doctor -> verify:api -> verify:web -> github status -> inventory.');
  console.log('--report=path   write machine-readable run summary JSON');
  console.log('--smoke         run pnpm search:smoke');
  console.log('--deepseek      run DeepSeek on staged diff (or --deepseek-diff/file)');
  console.log('--skip-* flags  disable selected steps');
  console.log('--json          print one-line JSON summary');
}

function run(cmd, label) {
  console.log(`\n▶ ${label}`);
  const out = execSync(cmd, { stdio: 'inherit' });
  return out;
}

function recordStep(result, step, status, detail = '') {
  result.steps.push({
    step,
    status,
    detail,
  });
}

function buildDeepSeekCommand() {
  const parts = ['pnpm agent:deepseek'];

  if (options.deepseekFile) {
    parts.push(`--file ${JSON.stringify(options.deepseekFile)}`);
  } else if (options.deepseekDiff) {
    parts.push(`--diff ${JSON.stringify(options.deepseekDiff)}`);
  } else {
    parts.push('--diff staged');
  }

  parts.push('--json');
  return parts.join(' ');
}

const result = {
  startedAt: new Date().toISOString(),
  steps: [],
};

console.log('[agent-ops] start');

try {
  if (!options.skipDoctor) {
    run('pnpm doctor', 'Doctor check');
    recordStep(result, 'doctor', 'ok');
  } else {
    console.log('\nℹ doctor skipped');
    recordStep(result, 'doctor', 'skipped');
  }

  if (!options.skipVerify) {
    run('pnpm verify:api', 'API verification');
    run('pnpm verify:web', 'Web verification');
    recordStep(result, 'verify', 'ok');
  } else {
    console.log('\nℹ verify skipped');
    recordStep(result, 'verify', 'skipped');
  }

  if (options.smoke) {
    run('pnpm search:smoke', 'Search smoke');
    recordStep(result, 'smoke', 'ok');
  } else {
    console.log('\nℹ smoke skipped (use --smoke)');
    recordStep(result, 'smoke', 'skipped');
  }

  if (!options.skipGithub) {
    run('pnpm agent:github status --json', 'GitHub workflow status');
    run('pnpm agent:inventory', 'Automation inventory');
    recordStep(result, 'github', 'ok');
  } else {
    console.log('\nℹ github inventory skipped');
    recordStep(result, 'github', 'skipped');
  }

  if (options.deepseek && !options.skipDeepseek) {
    run(buildDeepSeekCommand(), 'DeepSeek review');
    recordStep(result, 'deepseek', 'ok');
  } else {
    console.log('\nℹ deepseek skipped (use --deepseek or --deepseek-file/--deepseek-diff)');
    recordStep(result, 'deepseek', 'skipped');
  }

  result.finishedAt = new Date().toISOString();
  result.status = 'ok';

  if (options.reportPath) {
    fs.writeFileSync(options.reportPath, `${JSON.stringify(result)}\n`);
  }

  if (options.outputJson) {
    console.log(JSON.stringify(result));
  } else {
    console.log(`\n✓ agent-ops finished`);
    console.log(`result: ${JSON.stringify({ status: result.status, steps: result.steps.length })}`);
  }
} catch (error) {
  result.finishedAt = new Date().toISOString();
  result.status = 'failed';
  result.error = `${error.message}`;

  if (options.reportPath) {
    fs.writeFileSync(options.reportPath, `${JSON.stringify(result)}\n`);
  }

  if (options.outputJson) {
    console.log(JSON.stringify(result));
  } else {
    console.error(`\n✗ agent-ops failed`);
    console.error(result.error);
  }
  process.exitCode = 1;
}
