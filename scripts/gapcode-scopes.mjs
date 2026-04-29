#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const GAPCODE_DIR = path.join(ROOT, '.gapcode');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const scopesConfig = readJson(path.join(GAPCODE_DIR, 'scopes.json'));
const scopes = Array.isArray(scopesConfig.defaultScopes) ? scopesConfig.defaultScopes : [];
const payload = { scope: scopes };

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `matrix=${JSON.stringify(payload)}\n`);
}

console.log(JSON.stringify(payload, null, 2));
