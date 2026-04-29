# GapCode Workflow

## Local Commands
- `pnpm gapcode:index` regenerates `.gapcode/repo-index.json`, `.gapcode/deps-map.json`, `.gapcode/heavy-paths.json`, and `.gapcode/policies.json`.
- `pnpm gapcode:index:metrics` writes `.gapcode/index-metrics.json` for workspace-level reporting.
- `pnpm gapcode:bootstrap` runs `index + index:metrics + context + verify + metrics` in one command.
- `pnpm gapcode:context [base-ref]` regenerates `.gapcode/context-manifest.json`; it prefers a merge-base diff when a PR/base ref is available, falls back to staged/unstaged/untracked files, and auto-selects a workspace scope when one path dominates the diff.
- `pnpm gapcode:metrics` writes `.gapcode/context-metrics.json` for artifact/reporting use.
- `pnpm gapcode:verify` enforces manifest size guardrails against `.gapcode/policies.json`.
- `pnpm gapcode:context --scope apps/api` or `pnpm gapcode:context origin/main --scope apps/web` narrows the manifest to a single app/package path.
- `pnpm gapcode:context --no-auto-scope` keeps the manifest global when you do not want workspace inference.

## Metadata Files
- `.gapcode/repo-index.json`: shallow workspace inventory, tech hints, and estimated file counts.
- `.gapcode/index-metrics.json`: compact repo-level counts for workspaces, file estimates, heavy paths, and internal dependency edges.
- `.gapcode/deps-map.json`: workspace-to-workspace dependency map from `package.json` only.
- `.gapcode/heavy-paths.json`: concrete heavy paths and ask-before-read patterns.
- `.gapcode/policies.json`: machine-readable read limits and ignore rules.
- `.gapcode/scopes.json`: central scoped-artifact targets used by CI and local tooling.
- `.gapcode/context-manifest.json`: changed-file context, dependency expansion, and the current allowed read list.
- `.gapcode/context-metrics.json`: compact metrics snapshot for scope size and policy utilization.
- In GitHub Actions, metrics are also appended to the job summary for quick PR inspection.
- `.gapcode/context-metrics.schema.json` and `.gapcode/index-metrics.schema.json` define the expected metrics shape for verification.

## How To Operate
1. Start from `.gapcode/context-manifest.json`.
2. Stay within `allowedReadList` and `maxDependencyDepth` unless the task cannot be solved.
3. Let auto-scope shrink the first manifest; override with `--scope` or disable with `--no-auto-scope` when needed.
4. Regenerate metadata after workspace/package changes or before opening a PR.

## CI Workflows
- `gapcode-index.yml` refreshes repo metadata on pushes to `main` and on pull requests.
- `gapcode-changed-context.yml` builds a PR-wide context manifest plus scoped artifacts for `apps/api`, `apps/web`, `packages/types`, and `packages/ui`.
- `gapcode-changed-context.yml` now reads scoped targets from `.gapcode/scopes.json` through `pnpm gapcode:scopes`.
- `gapcode-changed-context.yml` now verifies each manifest and fails if scope size breaks policy thresholds.
- `verifyMode` in `.gapcode/policies.json` can be set to `warn` for softer rollout during adoption.

## Roadmap
- Emit manifest stats over time to track files-read and scope-size reduction per task.

## Troubleshooting
- If `context-manifest.json` is empty, make sure the branch has local or PR changes and rerun `pnpm gapcode:context`.
- If a package is missing from dependency expansion, regenerate `.gapcode/repo-index.json` first.
- If the manifest includes unrelated local edits, pass an explicit base ref like `pnpm gapcode:context origin/main` from your feature branch.
- If a task is app-local, rerun with `--scope apps/api`, `--scope apps/web`, or the target package path before expanding reads.
