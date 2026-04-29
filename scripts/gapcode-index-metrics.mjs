#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const repoIndex = readJson(path.join(GAPCODE_DIR, 'repo-index.json'));
const depsMap = readJson(path.join(GAPCODE_DIR, 'deps-map.json'));
const heavyPaths = readJson(path.join(GAPCODE_DIR, 'heavy-paths.json'));

const workspaces = repoIndex.workspaces ?? [];
const metrics = {
  generatedAt: new Date().toISOString(),
  packageManager: repoIndex.root?.packageManager ?? 'unknown',
  workspaceCount: workspaces.length,
  appCount: workspaces.filter((item) => item.type === 'app').length,
  packageCount: workspaces.filter((item) => item.type !== 'app').length,
  totalEstimatedFiles: workspaces.reduce((sum, item) => sum + (item.estimatedFileCount ?? 0), 0),
  totalEstimatedDirs: workspaces.reduce((sum, item) => sum + (item.estimatedDirCount ?? 0), 0),
  heavyPathCount: (heavyPaths.entries ?? []).length,
  internalDependencyEdges: Object.values(depsMap.workspaceDeps ?? {}).reduce((sum, deps) => sum + deps.length, 0),
};

fs.writeFileSync(path.join(GAPCODE_DIR, 'index-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const lines = [
    '## GapCode Repo Index Metrics',
    '',
    `- package manager: ${metrics.packageManager}`,
    `- workspaces: ${metrics.workspaceCount} (${metrics.appCount} apps / ${metrics.packageCount} packages)` ,
    `- estimated files: ${metrics.totalEstimatedFiles}`,
    `- estimated dirs: ${metrics.totalEstimatedDirs}`,
    `- heavy paths tracked: ${metrics.heavyPathCount}`,
    `- internal dependency edges: ${metrics.internalDependencyEdges}`,
    '',
  ];
  fs.appendFileSync(summaryFile, `${lines.join('\n')}\n`);
}

console.log(JSON.stringify(metrics, null, 2));
