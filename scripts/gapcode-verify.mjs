#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function validateRequired(data, keys, label) {
  for (const key of keys) {
    if (!(key in data)) {
      return `${label} is missing required key: ${key}`;
    }
  }
  return null;
}

function validateManifestShape(manifest) {
  const topLevel = validateRequired(manifest, ['generatedAt', 'changedFiles', 'allowedReadList', 'dependencyExpansion', 'excludedPatterns', 'policySnapshot'], 'context-manifest.json');
  if (topLevel) return topLevel;
  if (!Array.isArray(manifest.changedFiles)) return 'context-manifest.json changedFiles must be an array';
  if (!Array.isArray(manifest.allowedReadList)) return 'context-manifest.json allowedReadList must be an array';
  if (typeof manifest.dependencyExpansion !== 'object' || manifest.dependencyExpansion === null || Array.isArray(manifest.dependencyExpansion)) {
    return 'context-manifest.json dependencyExpansion must be an object';
  }
  if (!Array.isArray(manifest.excludedPatterns)) return 'context-manifest.json excludedPatterns must be an array';
  if (typeof manifest.policySnapshot !== 'object' || manifest.policySnapshot === null) return 'context-manifest.json policySnapshot must be an object';
  return null;
}

function validateMetricsShape(metrics, label, requiredKeys) {
  const topLevel = validateRequired(metrics, requiredKeys, label);
  if (topLevel) return topLevel;
  return null;
}

function finish(messages, mode) {
  if (messages.length === 0) return;
  const output = messages.join('\n');
  if (mode === 'warn') {
    console.warn(output);
    return;
  }
  console.error(output);
  process.exit(1);
}

function main() {
  const policies = readJson(path.join(GAPCODE_DIR, 'policies.json'));
  const manifest = readJson(path.join(GAPCODE_DIR, 'context-manifest.json'));
  const contextMetrics = fs.existsSync(path.join(GAPCODE_DIR, 'context-metrics.json')) ? readJson(path.join(GAPCODE_DIR, 'context-metrics.json')) : null;
  const indexMetrics = fs.existsSync(path.join(GAPCODE_DIR, 'index-metrics.json')) ? readJson(path.join(GAPCODE_DIR, 'index-metrics.json')) : null;

  const verifyMode = policies.verifyMode === 'warn' ? 'warn' : 'fail';
  const multiplier = policies.verifyThresholds?.allowedReadListMultiplier ?? 4;
  const issues = [];

  const manifestShapeIssue = validateManifestShape(manifest);
  if (manifestShapeIssue) issues.push(manifestShapeIssue);

  if (contextMetrics) {
    const metricsIssue = validateMetricsShape(
      contextMetrics,
      'context-metrics.json',
      ['generatedAt', 'scopeMode', 'diffMode', 'changedFiles', 'allowedReadList', 'dependencyEntries', 'maxFilesPerStep', 'maxTotalFilesRead', 'utilization'],
    );
    if (metricsIssue) issues.push(metricsIssue);
  }

  if (indexMetrics) {
    const indexIssue = validateMetricsShape(
      indexMetrics,
      'index-metrics.json',
      ['generatedAt', 'packageManager', 'workspaceCount', 'appCount', 'packageCount', 'totalEstimatedFiles', 'totalEstimatedDirs', 'heavyPathCount', 'internalDependencyEdges'],
    );
    if (indexIssue) issues.push(indexIssue);
  }

  if (manifest.allowedReadList.length > policies.maxTotalFilesRead) {
    issues.push(`GapCode manifest exceeds maxTotalFilesRead: ${manifest.allowedReadList.length} > ${policies.maxTotalFilesRead}`);
  }

  if (manifest.changedFiles.length > policies.maxTotalFilesRead) {
    issues.push(`GapCode manifest changedFiles exceeds maxTotalFilesRead: ${manifest.changedFiles.length} > ${policies.maxTotalFilesRead}`);
  }

  if (manifest.allowedReadList.length > policies.maxFilesPerStep * multiplier) {
    issues.push(`GapCode manifest allowedReadList is too large for staged analysis: ${manifest.allowedReadList.length} > ${policies.maxFilesPerStep * multiplier}`);
  }

  finish(issues, verifyMode);

  const summary = {
    scope: manifest.scope,
    scopeMode: manifest.scopeMode,
    changedFiles: manifest.changedFiles.length,
    allowedReadList: manifest.allowedReadList.length,
    maxFilesPerStep: policies.maxFilesPerStep,
    maxTotalFilesRead: policies.maxTotalFilesRead,
    verifyMode,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
