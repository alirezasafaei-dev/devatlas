#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const TMP_DIR = path.join(ROOT, 'tmp', 'agent-devflow');
const ARTIFACT_DIR = path.join(ROOT, 'artifacts', 'agent-devflow');
const argv = process.argv.slice(2);

const COMMANDS = new Set(['hook', 'review', 'context', 'scope', 'tasks', 'install-hooks']);
const command = COMMANDS.has(argv[0]) ? argv[0] : 'hook';
const args = COMMANDS.has(argv[0]) ? argv.slice(1) : argv;

function getArg(name, fallback = '') {
  const flag = `--${name}`;
  const prefix = `${flag}=`;
  for (let i = 0; i < args.length; i += 1) {
    const value = args[i];
    if (value === flag) return args[i + 1] ?? fallback;
    if (value.startsWith(prefix)) return value.slice(prefix.length);
  }
  return fallback;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function writeText(file, value) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, value);
}

function rel(file) {
  return path.relative(ROOT, file) || '.';
}

function run(commandText, options = {}) {
  const result = spawnSync(commandText, {
    cwd: ROOT,
    shell: true,
    encoding: 'utf8',
    stdio: options.capture ? 'pipe' : 'inherit',
    env: process.env,
  });

  return {
    ok: result.status === 0,
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    command: commandText,
  };
}

function readLines(commandText) {
  const result = run(commandText, { capture: true });
  if (!result.ok) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Command failed: ${commandText}`);
  }
  return result.stdout.split('\n').map(line => line.trim()).filter(Boolean);
}

function getChangedFiles(mode, range = '') {
  if (mode === 'staged') {
    return readLines('git diff --cached --name-only --diff-filter=ACMR');
  }

  if (mode === 'head') {
    return readLines('git diff --name-only --diff-filter=ACMR HEAD~1..HEAD');
  }

  if (mode === 'range' && range) {
    return readLines(`git diff --name-only --diff-filter=ACMR ${range}`);
  }

  return [];
}

function classifyFiles(files) {
  const scopes = new Set();
  const packages = new Set();
  const filesByScope = { api: [], web: [], shared: [], root: [], docs: [], infra: [], other: [] };

  for (const file of files) {
    let scope = 'other';
    if (file.startsWith('apps/api/')) scope = 'api';
    else if (file.startsWith('apps/web/')) scope = 'web';
    else if (file.startsWith('packages/')) scope = 'shared';
    else if (file.startsWith('docs/')) scope = 'docs';
    else if (file.startsWith('infra/') || file.startsWith('.github/')) scope = 'infra';
    else if (!file.includes('/')) scope = 'root';

    filesByScope[scope].push(file);
    scopes.add(scope);

    if (file.startsWith('packages/')) {
      const [, pkg] = file.split('/');
      if (pkg) packages.add(pkg);
    }
  }

  if (scopes.has('shared')) {
    const packageConsumers = {
      'api-client': ['web'],
      config: ['api', 'web'],
      content: ['api', 'web'],
      types: ['api'],
      ui: ['web'],
      utils: ['api', 'web'],
    };

    for (const pkg of packages) {
      for (const consumer of packageConsumers[pkg] || []) scopes.add(consumer);
    }
  }

  if (scopes.has('root')) {
    if (files.some(file => file === 'package.json' || file === 'pnpm-workspace.yaml' || file === 'turbo.json')) {
      scopes.add('api');
      scopes.add('web');
      scopes.add('shared');
    }
  }

  return {
    files,
    scopes: Array.from(scopes),
    packages: Array.from(packages),
    filesByScope,
  };
}

function buildTaskPlan(classification, phase) {
  const tasks = [];
  const hasApi = classification.scopes.includes('api');
  const hasWeb = classification.scopes.includes('web');
  const sharedPackages = classification.packages;

  if (phase === 'pre-commit') {
    const stagedCode = classification.files.filter(file => /\.(ts|tsx|js|jsx)$/.test(file));
    if (stagedCode.length > 0) {
      tasks.push({ name: 'lint-staged', command: 'pnpm exec lint-staged', scope: 'staged' });
    }
    if (hasApi) tasks.push({ name: 'api-lint', command: 'pnpm agent:verify api lint', scope: 'api' });
    if (hasWeb) tasks.push({ name: 'web-lint', command: 'pnpm agent:verify web lint', scope: 'web' });
    return tasks;
  }

  if (phase === 'pre-push') {
    if (hasApi) tasks.push({ name: 'api-verify', command: 'pnpm agent:verify api verify', scope: 'api' });
    if (hasWeb) tasks.push({ name: 'web-verify', command: 'pnpm agent:verify web verify', scope: 'web' });

    for (const pkg of sharedPackages) {
      tasks.push({
        name: `${pkg}-checks`,
        command: `pnpm agent:verify ${pkg} lint typecheck consumers`,
        scope: `packages/${pkg}`,
      });
    }

    return dedupeTasks(tasks);
  }

  return tasks;
}

function dedupeTasks(tasks) {
  const seen = new Set();
  return tasks.filter(task => {
    const key = `${task.name}:${task.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildContext(classification, phase) {
  const context = {
    phase,
    scopes: classification.scopes,
    packages: classification.packages,
    changedFiles: classification.files,
    suggestedContext: [],
  };

  const suggested = new Set(['AGENTS.md']);
  if (classification.scopes.includes('api')) {
    suggested.add('apps/api/package.json');
    suggested.add('apps/api/src/modules');
    suggested.add('docs/API-CONTRACE.md');
    suggested.add('docs/STANDARDS.md');
  }
  if (classification.scopes.includes('web')) {
    suggested.add('apps/web/package.json');
    suggested.add('apps/web/app');
    suggested.add('apps/web/features');
    suggested.add('docs/STANDARDS.md');
  }
  if (classification.scopes.includes('shared')) {
    suggested.add('package.json');
    for (const pkg of classification.packages) suggested.add(`packages/${pkg}`);
    suggested.add('docs/STANDARDS.md');
  }
  if (classification.scopes.includes('root')) suggested.add('package.json');
  if (classification.scopes.includes('infra')) suggested.add('.github/workflows');
  if (classification.scopes.includes('docs')) suggested.add('docs');

  context.suggestedContext = Array.from(suggested);
  return context;
}

function summarize(report) {
  const scopes = report.context.scopes || [];
  const packages = report.context.packages || [];
  const changedFiles = report.context.changedFiles || [];
  const lines = [];
  lines.push(`# Devflow ${report.phase}`);
  lines.push(`status: ${report.status}`);
  lines.push(`scopes: ${scopes.join(', ') || 'none'}`);
  lines.push(`packages: ${packages.join(', ') || 'none'}`);
  lines.push(`changed: ${changedFiles.length}`);
  if (report.review) {
    lines.push(`review: ${report.review.ok ? 'ok' : 'failed'} (${report.review.model || 'unknown'})`);
  }
  if (report.tasks.length > 0) {
    lines.push('tasks:');
    for (const task of report.tasks) {
      lines.push(`- ${task.name}: ${task.ok ? 'ok' : 'failed'}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

function writeArtifacts(name, report) {
  ensureDir(TMP_DIR);
  ensureDir(ARTIFACT_DIR);

  const stamp = timestamp();
  const baseName = `${stamp}-${name}`;
  const tmpJson = path.join(TMP_DIR, `${baseName}.json`);
  const tmpTxt = path.join(TMP_DIR, `${baseName}.txt`);
  const latestJson = path.join(TMP_DIR, `${name}-latest.json`);
  const latestTxt = path.join(TMP_DIR, `${name}-latest.txt`);
  const artifactJson = path.join(ARTIFACT_DIR, `${baseName}.json`);

  const summary = summarize(report);
  writeJson(tmpJson, report);
  writeText(tmpTxt, summary);
  writeJson(latestJson, report);
  writeText(latestTxt, summary);
  writeJson(artifactJson, report);

  return {
    tmpJson: rel(tmpJson),
    tmpTxt: rel(tmpTxt),
    latestJson: rel(latestJson),
    latestTxt: rel(latestTxt),
    artifactJson: rel(artifactJson),
  };
}

function getReviewCommand(diffMode, diffRange = '') {
  const timeoutSeconds = getArg('timeout-seconds', process.env.LOCAL_REVIEW_TIMEOUT_SECONDS || '180');
  if (diffMode === 'staged') {
    return `python3 scripts/deepseek-review.py --provider local --timeout-seconds ${timeoutSeconds} --diff staged --json`;
  }
  if (diffMode === 'head') {
    return `python3 scripts/deepseek-review.py --provider local --timeout-seconds ${timeoutSeconds} --diff HEAD~1..HEAD --json`;
  }
  return `python3 scripts/deepseek-review.py --provider local --timeout-seconds ${timeoutSeconds} --diff ${diffRange} --json`;
}

function runOfflineReview(diffMode, diffRange = '') {
  const commandText = getReviewCommand(diffMode, diffRange);
  const result = run(commandText, { capture: true });
  if (!result.ok) {
    return {
      ok: false,
      command: commandText,
      error: result.stderr.trim() || result.stdout.trim() || 'review failed',
    };
  }

  try {
    const payload = JSON.parse(result.stdout);
    return {
      ok: true,
      command: commandText,
      model: payload.model,
      review: payload.review,
    };
  } catch {
    return {
      ok: false,
      command: commandText,
      error: 'invalid JSON review output',
      raw: result.stdout.trim(),
    };
  }
}

function runTasks(tasks) {
  return tasks.map(task => {
    const result = run(task.command, { capture: true });
    return {
      ...task,
      ok: result.ok,
      status: result.status,
      output: result.ok
        ? (result.stdout.trim().split('\n').slice(-12).join('\n'))
        : (result.stderr.trim() || result.stdout.trim()).split('\n').slice(-20).join('\n'),
    };
  });
}

function installHooks() {
  const hooksDir = path.join(ROOT, '.githooks');
  ensureDir(hooksDir);

  const preCommit = `#!/usr/bin/env bash
set -euo pipefail
pnpm agent:devflow hook pre-commit
`;
  const prePush = `#!/usr/bin/env bash
set -euo pipefail
pnpm agent:devflow hook pre-push
`;

  const preCommitFile = path.join(hooksDir, 'pre-commit');
  const prePushFile = path.join(hooksDir, 'pre-push');
  writeText(preCommitFile, preCommit);
  writeText(prePushFile, prePush);
  fs.chmodSync(preCommitFile, 0o755);
  fs.chmodSync(prePushFile, 0o755);

  const config = run('git config core.hooksPath .githooks', { capture: true });
  if (!config.ok) {
    throw new Error(config.stderr.trim() || 'failed to configure core.hooksPath');
  }

  console.log('.githooks installed');
}

function resolveHookPhase() {
  const phase = args[0] || 'pre-commit';
  if (phase !== 'pre-commit' && phase !== 'pre-push') {
    throw new Error(`Unsupported hook phase: ${phase}`);
  }
  return phase;
}

function runHook() {
  const phase = resolveHookPhase();
  const files = getChangedFiles('staged');
  const classification = classifyFiles(files);
  const context = buildContext(classification, phase);
  const tasks = buildTaskPlan(classification, phase);
  const taskResults = runTasks(tasks);
  const failedTask = taskResults.find(task => !task.ok);

  let review = null;
  if (phase === 'pre-push' && files.length > 0) {
    review = runOfflineReview('staged');
  }

  const status = (!failedTask && (!review || review.ok)) ? 'ok' : 'failed';
  const report = {
    phase,
    status,
    context,
    tasks: taskResults,
    review,
    createdAt: new Date().toISOString(),
  };
  const artifacts = writeArtifacts(phase, report);

  console.log(`[devflow] ${phase} -> ${status}`);
  console.log(`[devflow] report: ${artifacts.latestJson}`);
  console.log(`[devflow] summary: ${artifacts.latestTxt}`);

  if (failedTask) {
    console.error(failedTask.output || `${failedTask.name} failed`);
    process.exit(1);
  }

  if (review && !review.ok) {
    console.error(review.error || 'offline review failed');
    process.exit(1);
  }
}

function runContext() {
  const mode = getArg('mode', 'staged');
  const range = getArg('range', '');
  const files = getChangedFiles(mode === 'range' ? 'range' : mode, range);
  const classification = classifyFiles(files);
  const context = buildContext(classification, 'context');
  const artifacts = writeArtifacts('context', {
    phase: 'context',
    status: 'ok',
    context,
    tasks: [],
    createdAt: new Date().toISOString(),
  });

  console.log(JSON.stringify({ context, artifacts }, null, 2));
}

function runScope() {
  const mode = getArg('mode', 'staged');
  const range = getArg('range', '');
  const files = getChangedFiles(mode === 'range' ? 'range' : mode, range);
  console.log(JSON.stringify(classifyFiles(files), null, 2));
}

function runTaskPreview() {
  const phase = getArg('phase', 'pre-push');
  const mode = getArg('mode', 'staged');
  const range = getArg('range', '');
  const files = getChangedFiles(mode === 'range' ? 'range' : mode, range);
  const classification = classifyFiles(files);
  console.log(JSON.stringify({ phase, tasks: buildTaskPlan(classification, phase) }, null, 2));
}

function runReview() {
  const diff = getArg('diff', 'staged');
  const review = diff === 'head'
    ? runOfflineReview('head')
    : diff === 'staged'
      ? runOfflineReview('staged')
      : runOfflineReview('range', diff);

  const report = {
    phase: 'review',
    status: review.ok ? 'ok' : 'failed',
    context: { diff, scopes: [], packages: [], changedFiles: [] },
    tasks: [],
    review,
    createdAt: new Date().toISOString(),
  };
  const artifacts = writeArtifacts('review', report);
  console.log(JSON.stringify({ review, artifacts }, null, 2));
  if (!review.ok) process.exit(1);
}

try {
  switch (command) {
    case 'install-hooks':
      installHooks();
      break;
    case 'context':
      runContext();
      break;
    case 'scope':
      runScope();
      break;
    case 'tasks':
      runTaskPreview();
      break;
    case 'review':
      runReview();
      break;
    case 'hook':
    default:
      runHook();
      break;
  }
} catch (error) {
  console.error(`[devflow] ${error.message}`);
  process.exit(1);
}
