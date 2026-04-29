#!/usr/bin/env node
// filepath: scripts/doctor.mjs

/**
 * DevAtlas Doctor (Sanity Check)
 * Super-fast, fail-fast, short-output
 */

import { execSync } from "node:child_process";
import fs from "node:fs";

const root = process.cwd();

function ok(msg) {
  console.log(`✓ ${msg}`);
}

function fail(msg, hint) {
  console.error(`✗ ${msg}`);
  if (hint) console.error(`  ${hint}`);
  process.exit(1);
}

function run(cmd, errMsg) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8" });
  } catch {
    fail(errMsg || `Command failed: ${cmd}`);
  }
}

function readJson(pathname) {
  try {
    return JSON.parse(fs.readFileSync(pathname, "utf8"));
  } catch {
    fail(`Invalid JSON: ${pathname}`);
  }
}

console.log("\n=== DevAtlas Doctor ===\n");

/* 1) Node */
const nodeMajor = Number(process.versions.node.split(".")[0]);
if (nodeMajor < 18) fail("Node >=18 required");
ok(`Node v${process.versions.node}`);

function parseDotEnvKeys(pathname) {
  return fs
    .readFileSync(pathname, "utf8")
    .split("\n")
    .map(line => line.trim())
    .filter(line => line && !line.startsWith("#"))
    .map(line => line.split("=")[0]?.trim())
    .filter(Boolean);
}

/* 2) packageManager */
const pkg = readJson("package.json");

const expectedPackageManager = pkg.packageManager;
if (!expectedPackageManager?.startsWith("pnpm@")) {
  fail("packageManager must be pinned to pnpm in package.json");
}
ok(`packageManager: ${expectedPackageManager}`);

/* 3) pnpm exists */
run("pnpm -v", "pnpm not installed — run: corepack enable");
ok("pnpm available");

/* 4) Required files */
const required = [
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.base.json",
  "turbo.json",
  "vitest.config.ts",
  "eslint.config.mjs",
];

for (const f of required) {
  if (!fs.existsSync(f)) fail(`Missing file: ${f}`);
  ok(f);
}

/* 5) Environment contract */
const envTemplates = [
  {
    file: ".env.example",
    requiredKeys: [
      "NODE_ENV",
      "PORT",
      "APP_BASE_URL",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "CORS_ORIGIN",
      "CONTENT_DIR",
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_API_BASE_URL",
    ],
  },
  {
    file: "apps/api/.env.example",
    requiredKeys: [
      "NODE_ENV",
      "PORT",
      "APP_BASE_URL",
      "DATABASE_URL",
      "TEST_DATABASE_URL",
      "CORS_ORIGIN",
      "CONTENT_DIR",
    ],
  },
  {
    file: "apps/web/.env.example",
    requiredKeys: [
      "NEXT_PUBLIC_SITE_URL",
      "NEXT_PUBLIC_API_BASE_URL",
    ],
  },
];

for (const template of envTemplates) {
  if (!fs.existsSync(template.file)) fail(`Missing env template: ${template.file}`);
  const keys = new Set(parseDotEnvKeys(template.file));
  for (const key of template.requiredKeys) {
    if (!keys.has(key)) fail(`Missing ${key} in ${template.file}`);
  }
  ok(`${template.file} env template OK`);
}

/* 6) Validate TS aliases */
const ts = readJson("tsconfig.base.json");
const paths = ts.compilerOptions?.paths ?? {};

const aliases = [
  "@devatlas/types",
  "@devatlas/types/*",
  "@devatlas/utils",
  "@devatlas/utils/*",
  "@devatlas/config",
  "@devatlas/config/*",
  "@devatlas/content",
  "@devatlas/content/*",
  "@devatlas/api-client",
  "@devatlas/api-client/*",
  "@devatlas/ui",
  "@devatlas/ui/*"
];

for (const a of aliases) {
  if (!paths[a]) fail(`Missing TS alias: ${a}`);
}
ok("TS aliases OK");

/* 7) Workspace integrity */
run("pnpm install --frozen-lockfile", "Workspace install failed");
ok("Workspace OK");

/* 8) Turbo sanity */
run("pnpm turbo run build --dry", "Turbo config invalid");
ok("Turbo OK");

console.log("\n✓ Doctor passed. System looks OK.\n");
