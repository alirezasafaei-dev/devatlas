#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'];
const DEFAULT_POLICIES = {
  maxDependencyDepth: 2,
  alwaysIgnore: [
    'node_modules/**', '.git/**', 'dist/**', 'build/**', '.next/**', 'out/**', 'coverage/**',
    'generated/**', 'vendor/**', 'tmp/**', 'cache/**', 'public/**', 'assets/**', 'static/**', '.turbo/**',
  ],
  askBeforeReadPatterns: ['pnpm-lock.yaml', '**/*lock*', '**/*.min.*', '**/*.bundle.*', '**/*.map'],
};

function readJson(file, fallback = null) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function matchesSimplePattern(file, pattern) {
  if (pattern.endsWith('/**')) return file === pattern.slice(0, -3) || file.startsWith(pattern.slice(0, -2));
  if (pattern.startsWith('**/*.')) return file.endsWith(pattern.slice(4));
  return file === pattern;
}

function isIgnored(file, policies) {
  return [...(policies.alwaysIgnore ?? []), ...(policies.askBeforeReadPatterns ?? [])].some((pattern) => matchesSimplePattern(file, pattern));
}

function parseArgs(argv) {
  const options = { baseRef: '', scope: '', autoScope: true };
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--no-auto-scope') {
      options.autoScope = false;
      continue;
    }
    if (value === '--scope') {
      options.scope = argv[index + 1] ?? '';
      index += 1;
      continue;
    }
    if (value.startsWith('--scope=')) {
      options.scope = value.slice('--scope='.length);
      continue;
    }
    if (!options.baseRef) {
      options.baseRef = value;
    }
  }
  options.scope = toPosix(options.scope.replace(/^\.\/+/, '').replace(/\/+$/, ''));
  return options;
}

function safeRun(cmd) {
  try {
    return run(cmd);
  } catch {
    return '';
  }
}

function parseLines(output) {
  return [...new Set(output.split('\n').map((line) => line.trim()).filter(Boolean))].sort();
}

function currentBranch() {
  return safeRun('git branch --show-current');
}

function resolveBaseRef(baseRefArg) {
  if (baseRefArg) return baseRefArg;
  if (process.env.GITHUB_BASE_REF) return `origin/${process.env.GITHUB_BASE_REF}`;
  const branch = currentBranch();
  if (!branch || branch === 'main' || branch === 'master') return '';
  if (safeRun(`git rev-parse --verify origin/${branch}`)) return `origin/${branch}`;
  if (safeRun('git rev-parse --verify origin/main')) return 'origin/main';
  if (safeRun('git rev-parse --verify origin/master')) return 'origin/master';
  return '';
}

function gitChangedFiles(baseRefArg) {
  const baseRef = resolveBaseRef(baseRefArg);
  if (baseRef) {
    const mergeBase = safeRun(`git merge-base HEAD ${baseRef}`);
    if (mergeBase) {
      const output = safeRun(`git diff --name-only ${mergeBase}...HEAD --relative`);
      const files = parseLines(output);
      if (files.length > 0) {
        return { files, source: `git diff --name-only ${mergeBase}...HEAD --relative`, mode: 'base-diff' };
      }
    }
  }

  const staged = parseLines(safeRun('git diff --name-only --cached --relative'));
  const unstaged = parseLines(safeRun('git diff --name-only --relative'));
  const untracked = parseLines(safeRun('git ls-files --others --exclude-standard'));
  const files = [...new Set([...staged, ...unstaged, ...untracked])].sort();
  if (files.length > 0) {
    return {
      files,
      source: 'git diff --name-only --cached --relative + git diff --name-only --relative + git ls-files --others --exclude-standard',
      mode: 'working-tree',
    };
  }

  return { files: [], source: 'none', mode: 'empty' };
}

function parseImports(file) {
  const content = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const pattern = /(?:import|export)\s+(?:[^'";]+\s+from\s+)?['"]([^'\"]+)['"]|require\(['"]([^'\"]+)['"]\)/g;
  const imports = new Set();
  let match;
  while ((match = pattern.exec(content))) {
    const specifier = match[1] ?? match[2];
    if (specifier) imports.add(specifier);
  }
  return [...imports];
}

function resolveRelativeImport(fromFile, specifier) {
  const baseDir = path.dirname(path.join(ROOT, fromFile));
  const rawTarget = path.resolve(baseDir, specifier);
  const candidates = [
    rawTarget,
    ...SOURCE_EXTENSIONS.map((ext) => `${rawTarget}${ext}`),
    ...SOURCE_EXTENSIONS.map((ext) => path.join(rawTarget, `index${ext}`)),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return toPosix(path.relative(ROOT, candidate));
    }
  }
  return null;
}

function resolveWorkspaceImport(specifier, depsMap) {
  const names = Object.keys(depsMap.workspaceDeps ?? {});
  const matched = names.find((name) => specifier === name || specifier.startsWith(`${name}/`));
  if (!matched) return null;
  const repoIndex = readJson(path.join(GAPCODE_DIR, 'repo-index.json'), { workspaces: [] });
  const workspace = repoIndex.workspaces.find((entry) => entry.name === matched);
  if (!workspace) return null;
  return workspace.path;
}

function readRepoIndex() {
  return readJson(path.join(GAPCODE_DIR, 'repo-index.json'), { workspaces: [] });
}

function detectScope(changedFiles) {
  const repoIndex = readRepoIndex();
  const workspaces = (repoIndex.workspaces ?? []).map((workspace) => workspace.path).sort((a, b) => b.length - a.length);
  const counts = new Map();

  for (const file of changedFiles) {
    const matched = workspaces.find((workspacePath) => file === workspacePath || file.startsWith(`${workspacePath}/`));
    if (!matched) continue;
    counts.set(matched, (counts.get(matched) ?? 0) + 1);
  }

  if (counts.size === 0) return null;
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]));
  const [topScope, topCount] = ranked[0];
  const totalScoped = ranked.reduce((sum, [, count]) => sum + count, 0);
  if (topCount === totalScoped) return topScope;
  if (topCount / totalScoped >= 0.7) return topScope;
  return null;
}

function buildManifest(changedFiles, policies, depsMap) {
  const visited = new Set();
  const allowed = new Set();
  const directImports = {};
  const queue = changedFiles.map((file) => ({ file, depth: 0 }));

  for (const file of changedFiles) {
    allowed.add(file);
  }

  while (queue.length > 0) {
    const { file, depth } = queue.shift();
    if (visited.has(file) || depth >= (policies.maxDependencyDepth ?? 2)) continue;
    visited.add(file);
    if (!SOURCE_EXTENSIONS.includes(path.extname(file)) || !fs.existsSync(path.join(ROOT, file))) continue;

    const imports = parseImports(file);
    directImports[file] = [];
    for (const specifier of imports) {
      let resolved = null;
      if (specifier.startsWith('.')) {
        resolved = resolveRelativeImport(file, specifier);
      } else if (specifier.startsWith('@devatlas/')) {
        resolved = resolveWorkspaceImport(specifier, depsMap);
      }
      if (!resolved) continue;
      if (isIgnored(resolved, policies)) continue;
      directImports[file].push(resolved);
      if (!allowed.has(resolved)) allowed.add(resolved);
      if (!visited.has(resolved) && resolved.includes('.')) {
        queue.push({ file: resolved, depth: depth + 1 });
      }
    }
    directImports[file].sort();
  }

  return {
    generatedAt: new Date().toISOString(),
    modeHint: 'bootstrap-context',
    changedFiles,
    allowedReadList: [...allowed].sort(),
    dependencyExpansion: directImports,
    excludedPatterns: [...(policies.alwaysIgnore ?? []), ...(policies.askBeforeReadPatterns ?? [])],
    policySnapshot: {
      maxDependencyDepth: policies.maxDependencyDepth ?? 2,
      maxFilesPerStep: policies.maxFilesPerStep ?? 12,
      maxTotalFilesRead: policies.maxTotalFilesRead ?? 60,
    },
  };
}

function main() {
  ensureDir(GAPCODE_DIR);
  const policies = readJson(path.join(GAPCODE_DIR, 'policies.json'), DEFAULT_POLICIES);
  const depsMap = readJson(path.join(GAPCODE_DIR, 'deps-map.json'), { workspaceDeps: {} });
  const options = parseArgs(process.argv.slice(2));
  const changed = gitChangedFiles(options.baseRef);
  const effectiveScope = options.scope || (options.autoScope ? detectScope(changed.files) : '');
  const filteredChangedFiles = changed.files
    .filter((file) => !isIgnored(file, policies))
    .filter((file) => !effectiveScope || file === effectiveScope || file.startsWith(`${effectiveScope}/`));
  const manifest = buildManifest(filteredChangedFiles, policies, depsMap);
  manifest.diffSource = changed.source;
  manifest.diffMode = changed.mode;
  manifest.scope = effectiveScope || null;
  manifest.scopeMode = options.scope ? 'manual' : effectiveScope ? 'auto' : 'global';
  fs.writeFileSync(path.join(GAPCODE_DIR, 'context-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(JSON.stringify({
    contextManifest: '.gapcode/context-manifest.json',
    changedFiles: manifest.changedFiles.length,
    allowedReadList: manifest.allowedReadList.length,
    diffSource: manifest.diffSource,
    diffMode: manifest.diffMode,
    scope: manifest.scope,
    scopeMode: manifest.scopeMode,
  }, null, 2));
}

main();
