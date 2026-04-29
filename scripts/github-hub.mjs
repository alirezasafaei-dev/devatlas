#!/usr/bin/env node
// filepath: scripts/github-hub.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const ROOT_DIR = process.cwd();

function parseDotEnv(filePath) {
  const out = new Map();
  if (!fs.existsSync(filePath)) {
    return out;
  }

  for (const line of fs.readFileSync(filePath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separator = trimmed.indexOf('=');
    if (separator < 0) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (key) {
      out.set(key, value.replace(/^"|"$/g, '').replace(/^'|'$/g, ''));
    }
  }

  return out;
}

function parseArgs(argv) {
  const output = { command: 'status', flags: {} };
  const args = argv.slice(2);

  if (!args.length) {
    return output;
  }

  output.command = args[0];
  for (let i = 1; i < args.length; i += 1) {
    const arg = args[i];
    if (!arg.startsWith('--')) continue;
    const [rawKey, rawValue] = arg.slice(2).split('=', 2);
    if (rawValue === undefined) {
      output.flags[rawKey] = true;
      continue;
    }
    output.flags[rawKey] = rawValue;
  }

  return output;
}

function loadLocalWorkflows() {
  const workflowsDir = path.join(ROOT_DIR, '.github', 'workflows');
  if (!fs.existsSync(workflowsDir)) return [];

  return fs
    .readdirSync(workflowsDir)
    .filter((name) => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map((name) => ({
      name,
      path: `.github/workflows/${name}`,
    }));
}

function formatTime(ms) {
  if (!ms) return 'n/a';
  return new Date(ms).toISOString();
}

async function githubRequest(pathname, token) {
  const url = `https://api.github.com${pathname}`;
  const response = await fetch(url, {
    headers: {
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'devatlas-automation',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${response.status} ${response.statusText}: ${body}`);
  }

  return response.json();
}

function resolveRepoFromEnv(flags) {
  if (flags.owner && flags.repo) {
    return { owner: flags.owner, repo: flags.repo };
  }

  const ghRepo = process.env.GITHUB_REPOSITORY ?? process.env.GITHUB_REPO;
  if (ghRepo && ghRepo.includes('/')) {
    const [owner, repo] = ghRepo.split('/', 2);
    return { owner, repo };
  }

  return { owner: process.env.GITHUB_OWNER || 'asdeveloop', repo: process.env.GITHUB_REPO || 'devatlas' };
}

function loadAgentsFromSkillToml() {
  const skillFile = path.join(ROOT_DIR, 'skill.toml');
  if (!fs.existsSync(skillFile)) return [];

  const raw = fs.readFileSync(skillFile, 'utf8');
  const matches = [...raw.matchAll(/^\[skills\.([a-z_]+)\]\n/gm)];
  return matches
    .map((match) => match[1])
    .filter(Boolean)
    .map((id) => ({ id }));
}

function printHelp() {
  console.log(`Usage: pnpm agent:github <command> [--json] [--owner asdeveloop --repo devatlas]
`);
  console.log('Commands:');
  console.log('  status      Show local and (if token exists) GitHub workflow status');
  console.log('  actions     List workflow files + latest workflow runs');
  console.log('  agents      Show local agent roles from skill.toml');
  console.log('  inventory   Export full local/remote report as JSON to stdout');
}

function maybePrintJSON(result, asJson) {
  if (asJson) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (result.error) {
    console.log(`\n✗ ${result.error}`);
  }

  if (result.actions) {
    console.log('\n[GitHub Actions]');
    if (result.actions.local?.length) {
      for (const wf of result.actions.local) {
        console.log(`- ${wf.name}`);
      }
    }
  }

  if (result.agents) {
    console.log('\n[Agents]');
    for (const agent of result.agents) {
      console.log(`- ${agent.id}`);
    }
  }

  if (result.lastRuns?.length) {
    console.log('\n[Latest Runs]');
    for (const run of result.lastRuns) {
      console.log(`- ${run.name} #${run.run_number} (${run.conclusion ?? 'in_progress'}) ${formatTime(run.updated_at)}`);
    }
  }
}

async function runStatus(options) {
  const report = await collectInventory(options, true);
  maybePrintJSON(report, options.flags.json);
}

async function runActions(options) {
  const report = await collectInventory(options, false);
  maybePrintJSON(report.actions, options.flags.json);
}

async function runAgents() {
  const agents = loadAgentsFromSkillToml();
  maybePrintJSON({ agents }, false);
}

async function runInventory(options) {
  const report = await collectInventory(options, false);
  maybePrintJSON(report, true);
}

async function collectInventory(options, includeTokenHint = false) {
  const localWorkflows = loadLocalWorkflows();
  const env = parseDotEnv(path.join(ROOT_DIR, '.env.local'));
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || env.get('GITHUB_TOKEN') || env.get('GH_TOKEN');
  const { owner, repo } = resolveRepoFromEnv(options.flags);

  const agents = loadAgentsFromSkillToml();
  const actions = { local: localWorkflows, remote: null, summary: `local:${localWorkflows.length}` };
  const summary = {
    local: {
      owner,
      repo,
      workflows: localWorkflows,
      hasToken: Boolean(token),
    },
    agents: agents,
    actions,
    lastRuns: [],
  };

  if (!token) {
    if (includeTokenHint) {
      summary.error = 'No GitHub token found (set GITHUB_TOKEN or GH_TOKEN in .env.local or environment).';
    }
    return summary;
  }

  try {
    const workflowData = await githubRequest(`/repos/${owner}/${repo}/actions/workflows`, token);
    actions.remote = (workflowData.workflows || []).map((w) => ({
      id: w.id,
      name: w.name,
      path: w.path,
      state: w.state,
      url: w.html_url,
    }));

    const runsData = await githubRequest(`/repos/${owner}/${repo}/actions/runs?per_page=5`, token);
    summary.lastRuns = (runsData.workflow_runs || []).map((run) => ({
      name: run.name,
      status: run.status,
      conclusion: run.conclusion,
      run_number: run.run_number,
      updated_at: run.updated_at,
      html_url: run.html_url,
    }));
    actions.summary = `local:${localWorkflows.length} remote:${actions.remote.length}`;
  } catch (err) {
    summary.error = `GitHub API error: ${err.message}`;
    if (includeTokenHint) {
      // keep local data visible
    }
  }

  return summary;
}

async function main() {
  const options = parseArgs(process.argv);
  try {
    if (options.command === 'status') {
      await runStatus(options);
      return;
    }
    if (options.command === 'actions') {
      await runActions(options);
      return;
    }
    if (options.command === 'agents') {
      await runAgents();
      return;
    }
  if (options.command === 'inventory') {
      await runInventory(options);
      return;
    }

    if (options.command === 'help' || options.command === '--help' || options.command === '-h') {
      printHelp();
      return;
    }

    printHelp();
    process.exitCode = 1;
  } catch (err) {
    console.error(`github-hub failed: ${err.message}`);
    process.exitCode = 1;
  }
}

main();
