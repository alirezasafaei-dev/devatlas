#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const manifest = readJson(path.join(GAPCODE_DIR, 'context-manifest.json'));
const policies = readJson(path.join(GAPCODE_DIR, 'policies.json'));

const metrics = {
  generatedAt: new Date().toISOString(),
  scope: manifest.scope,
  scopeMode: manifest.scopeMode,
  diffMode: manifest.diffMode,
  changedFiles: manifest.changedFiles.length,
  allowedReadList: manifest.allowedReadList.length,
  dependencyEntries: Object.keys(manifest.dependencyExpansion ?? {}).length,
  maxFilesPerStep: policies.maxFilesPerStep,
  maxTotalFilesRead: policies.maxTotalFilesRead,
  utilization: {
    allowedReadListPct: Number(((manifest.allowedReadList.length / policies.maxTotalFilesRead) * 100).toFixed(1)),
    changedFilesPct: Number(((manifest.changedFiles.length / policies.maxTotalFilesRead) * 100).toFixed(1)),
  },
};

fs.writeFileSync(path.join(GAPCODE_DIR, 'context-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`);

const summaryFile = process.env.GITHUB_STEP_SUMMARY;
if (summaryFile) {
  const lines = [
    '## GapCode Context Metrics',
    '',
    `- scope: ${metrics.scope ?? 'global'}`,
    `- scope mode: ${metrics.scopeMode}`,
    `- diff mode: ${metrics.diffMode}`,
    `- changed files: ${metrics.changedFiles}`,
    `- allowed read list: ${metrics.allowedReadList}/${metrics.maxTotalFilesRead} (${metrics.utilization.allowedReadListPct}%)`,
    `- dependency entries: ${metrics.dependencyEntries}`,
    '',
  ];
  fs.appendFileSync(summaryFile, `${lines.join('\n')}\n`);
}

console.log(JSON.stringify(metrics, null, 2));
