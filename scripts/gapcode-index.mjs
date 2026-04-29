#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');

const ALWAYS_IGNORE = [
  'node_modules', '.git', 'dist', 'build', '.next', 'out', 'coverage',
  'generated', 'vendor', 'tmp', 'cache', 'public', 'assets', 'static', '.turbo',
];

const IGNORE_FILE_PATTERNS = [
  /(^|\/)pnpm-lock\.yaml$/,
  /(^|\/)package-lock\.json$/,
  /(^|\/)yarn\.lock$/,
  /\.min\./,
  /\.bundle\./,
  /\.(png|jpg|jpeg|gif|webp|svg|ico|mp4|mov|zip|pdf|map)$/i,
];

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function safeReadJson(file) {
  return fs.existsSync(file) ? readJson(file) : null;
}

function listRootEntries() {
  return fs.readdirSync(ROOT, { withFileTypes: true }).map((entry) => ({
    name: entry.name,
    type: entry.isDirectory() ? 'dir' : entry.isFile() ? 'file' : 'other',
  })).sort((a, b) => a.name.localeCompare(b.name));
}

function expandWorkspacePatterns(patterns) {
  const results = [];
  for (const pattern of patterns) {
    const base = pattern.replace(/\/*\*.*$/, '').replace(/\/$/, '');
    const absBase = path.join(ROOT, base);
    if (!fs.existsSync(absBase)) continue;
    for (const entry of fs.readdirSync(absBase, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        results.push(path.join(base, entry.name));
      }
    }
  }
  return [...new Set(results)].sort();
}

function detectPackageManager(rootPackageJson) {
  const manager = rootPackageJson.packageManager ?? 'unknown';
  return manager.split('@')[0];
}

function classifyWorkspace(relativePath, pkg) {
  if (relativePath.startsWith('apps/')) return 'app';
  if (relativePath.startsWith('packages/')) return 'package';
  return pkg.private ? 'private-package' : 'package';
}

function estimateTechHints(pkg) {
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const hints = [];
  if (deps.next) hints.push('nextjs');
  if (deps.react) hints.push('react');
  if (deps['@nestjs/core']) hints.push('nestjs');
  if (deps['drizzle-orm']) hints.push('drizzle');
  if (deps.vitest) hints.push('vitest');
  if (deps.typescript) hints.push('typescript');
  return hints;
}

function countFiles(dir) {
  let files = 0;
  let dirs = 0;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const relative = path.relative(ROOT, path.join(current, entry.name));
      if (entry.isDirectory()) {
        if (ALWAYS_IGNORE.includes(entry.name)) continue;
        dirs += 1;
        stack.push(path.join(current, entry.name));
        continue;
      }
      if (IGNORE_FILE_PATTERNS.some((pattern) => pattern.test(relative))) continue;
      files += 1;
    }
  }
  return { files, dirs };
}

function listKeyConfigs(relativePath) {
  const candidates = [
    'package.json',
    'tsconfig.json',
    'tsconfig.build.json',
    'next.config.ts',
    'vitest.config.ts',
    'nest-cli.json',
  ];
  return candidates
    .map((file) => path.join(relativePath, file))
    .filter((file) => fs.existsSync(path.join(ROOT, file)));
}

function buildDependencyMap(workspaces) {
  const names = new Set(workspaces.map((workspace) => workspace.name));
  const map = {};
  for (const workspace of workspaces) {
    const allDeps = {
      ...workspace.packageJson.dependencies,
      ...workspace.packageJson.devDependencies,
      ...workspace.packageJson.peerDependencies,
    };
    map[workspace.name] = Object.keys(allDeps).filter((dep) => names.has(dep)).sort();
  }
  return map;
}

function detectHeavyPaths(rootEntries, workspaces) {
  const heavy = [];
  for (const entry of rootEntries) {
    if (entry.type === 'dir' && ALWAYS_IGNORE.includes(entry.name)) {
      heavy.push({ path: entry.name, reason: 'generated/dependency/build directory', mode: 'always-ignore' });
    }
  }
  for (const workspace of workspaces) {
    const abs = path.join(ROOT, workspace.path);
    for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!ALWAYS_IGNORE.includes(entry.name)) continue;
      heavy.push({
        path: path.join(workspace.path, entry.name),
        reason: 'nested generated/build directory',
        mode: 'always-ignore',
      });
    }
  }
  heavy.push(
    { path: 'pnpm-lock.yaml', reason: 'lockfile; high token cost with low task value', mode: 'ask-before-read' },
    { path: '**/*.map', reason: 'source map artifact', mode: 'always-ignore' },
    { path: '**/*.{png,jpg,jpeg,gif,webp,svg,ico,mp4,mov,zip,pdf}', reason: 'binary/media asset', mode: 'ask-before-read' },
  );
  return heavy;
}

function buildPolicies() {
  return {
    version: 1,
    maxFilesPerStep: 12,
    maxTotalFilesRead: 60,
    maxDependencyDepth: 2,
    largeDirFileThreshold: 200,
    askBeforeReadingLargeDirs: true,
    askBeforeReadPatterns: [
      'pnpm-lock.yaml',
      '**/*lock*',
      '**/*.min.*',
      '**/*.bundle.*',
      '**/*.{png,jpg,jpeg,gif,webp,svg,ico,mp4,mov,zip,pdf,map}',
      'public/**',
      'assets/**',
      'static/**',
    ],
    alwaysIgnore: ALWAYS_IGNORE.map((name) => `${name}/**`),
    allowedBootstrapFiles: [
      '.gapcode/context-manifest.json',
      '.gapcode/repo-index.json',
      '.gapcode/deps-map.json',
      '.gapcode/heavy-paths.json',
      'AGENTS.md',
      'package.json',
      'pnpm-workspace.yaml',
      'turbo.json',
    ],
    operationalModes: {
      analyze: ['use metadata first', 'limit source reads to scoped files and direct deps'],
      implement: ['start from context manifest', 'stop expansion once patch seam is clear'],
      review: ['prioritize changed files', 'surface risks before summaries'],
    },
  };
}

function main() {
  ensureDir(GAPCODE_DIR);
  const rootEntries = listRootEntries();
  const rootPackageJson = readJson(path.join(ROOT, 'package.json'));
  const workspaceConfigRaw = fs.readFileSync(path.join(ROOT, 'pnpm-workspace.yaml'), 'utf8');
  const workspacePatterns = workspaceConfigRaw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.replace(/^-\s+['\"]?/, '').replace(/['\"]$/, ''));

  const workspacePaths = expandWorkspacePatterns(workspacePatterns);
  const workspaces = workspacePaths.map((workspacePath) => {
    const packageJsonPath = path.join(ROOT, workspacePath, 'package.json');
    const packageJson = readJson(packageJsonPath);
    const counts = countFiles(path.join(ROOT, workspacePath));
    return {
      name: packageJson.name,
      path: workspacePath,
      type: classifyWorkspace(workspacePath, packageJson),
      keyConfigFiles: listKeyConfigs(workspacePath),
      estimatedFileCount: counts.files,
      estimatedDirCount: counts.dirs,
      techHints: estimateTechHints(packageJson),
      packageJson,
    };
  });

  const repoIndex = {
    generatedAt: new Date().toISOString(),
    root: {
      name: rootPackageJson.name,
      packageManager: detectPackageManager(rootPackageJson),
      workspaceTooling: ['pnpm', 'turbo'],
      rootEntries,
    },
    workspaces: workspaces.map(({ packageJson, ...workspace }) => workspace),
  };

  const depsMap = {
    generatedAt: new Date().toISOString(),
    workspaceDeps: buildDependencyMap(workspaces),
  };

  const heavyPaths = {
    generatedAt: new Date().toISOString(),
    entries: detectHeavyPaths(rootEntries, workspaces),
  };

  const policiesPath = path.join(GAPCODE_DIR, 'policies.json');
  const policies = safeReadJson(policiesPath) ?? buildPolicies();

  fs.writeFileSync(path.join(GAPCODE_DIR, 'repo-index.json'), `${JSON.stringify(repoIndex, null, 2)}\n`);
  fs.writeFileSync(path.join(GAPCODE_DIR, 'deps-map.json'), `${JSON.stringify(depsMap, null, 2)}\n`);
  fs.writeFileSync(path.join(GAPCODE_DIR, 'heavy-paths.json'), `${JSON.stringify(heavyPaths, null, 2)}\n`);
  fs.writeFileSync(policiesPath, `${JSON.stringify(policies, null, 2)}\n`);

  console.log(JSON.stringify({
    repoIndex: '.gapcode/repo-index.json',
    depsMap: '.gapcode/deps-map.json',
    heavyPaths: '.gapcode/heavy-paths.json',
    policies: '.gapcode/policies.json',
    workspaces: repoIndex.workspaces.length,
  }, null, 2));
}

main();
