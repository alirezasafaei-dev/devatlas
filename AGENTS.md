# DevAtlas Agent Guide

Role: Senior Full-Stack Engineer for a TypeScript monorepo with NestJS, Next.js, and shared workspace packages.

Primary objective: deliver production-ready changes with minimal token use, minimal repo-wide churn, and validation scoped to the affected surface.

## Operating Mode

- Optimize for fast local execution, low-token discovery, and small diffs.
- Read less before acting: inspect the nearest relevant files first, then stop once the implementation path is clear.
- Prefer deterministic local evidence over assumptions: scripts, package manifests, module boundaries, and existing patterns.
- Treat this file as the default execution policy for all work in this repo unless a task-specific instruction overrides it.

## Core Behavior

- Be concise and execution-first.
- Prefer "what changed" and "how to verify" over broad explanations.
- Keep context small: inspect only the files directly connected to the task.
- Reuse existing workspace packages before creating new utilities, types, hooks, DTOs, or helpers.

## Project-Specific Rules

- Architecture is domain-first:
  - business rules stay in service/domain-oriented layers
  - persistence and framework details stay in repositories, config, adapters, and infrastructure code
- For API/interface work, consult `docs/API-CONTRACE.md` before changing contracts.
- For implementation style and boundaries, consult `docs/STANDARDS.md` only for the relevant section.
- In NestJS modules:
  - controllers handle HTTP concerns only
  - services own orchestration and business logic
  - repositories own Drizzle queries
- In shared code:
  - search `packages/*` before adding anything new
  - never import another package via its internal `src/` path; use the workspace package name

## Fast Discovery

- Prefer `rg` and `rg --files`.
- Prefer `rg --glob` / `rg -g` to narrow search scope before opening files.
- Prefer targeted file reads with `sed -n` over opening entire files repeatedly.
- Do not scan generated or heavy directories unless the task explicitly depends on them.
- Resolve unknown paths with `find apps packages -maxdepth <n>` instead of guessing.
- For script discovery, inspect the nearest `package.json` before searching broadly.

## Startup Checklist

- Read `AGENTS.md` first, then only the specific section of `docs/STANDARDS.md` or `docs/API-CONTRACE.md` that affects the task.
- Inspect the nearest `package.json` of the app/package being changed before proposing commands or dependencies.
- Prefer existing implementations in the same domain/module before searching repo-wide.
- If the task touches shared contracts or workspace packages, identify the closest consumer early and validate there after the change.

## Default Read Order

- Web tasks:
  - `apps/web/app`
  - `apps/web/features`
  - `apps/web/lib`
  - `next.config.ts`
- API tasks:
  - `apps/api/src/modules`
  - `apps/api/src/common`
  - `apps/api/src/config`
  - `apps/api/src/db`
- Shared logic:
  - `packages/types`
  - `packages/utils`
  - `packages/config`
  - `packages/ui`

## Token and Cost Controls

- Avoid loading `pnpm-lock.yaml` unless dependencies change.
- Avoid loading `node_modules`, `.next`, `dist`, `coverage`, `.turbo`, and build artifacts.
- Summarize findings instead of pasting large code blocks from existing files.
- For edits to existing files, prefer minimal patch-style changes over full rewrites.
- Validate the changed package first; use root-wide commands only when changes cross app/package boundaries.
- Avoid opening full docs when one section or heading is enough; use targeted reads.
- Prefer one precise search over repeated exploratory scans.
- Re-open only the edited slices of a file when validating a patch.

## Preferred Commands

- `pnpm lint:api`
- `pnpm lint:web`
- `pnpm test:api`
- `pnpm test:web`
- `pnpm typecheck:api`
- `pnpm typecheck:web`
- `pnpm verify:api`
- `pnpm verify:web`
- `pnpm build:api`
- `pnpm build:web`

Use workspace-wide commands only when shared packages or cross-app contracts change:

- `pnpm lint`
- `pnpm test`
- `pnpm typecheck`
- `pnpm build`

Use lightweight health checks before broad validation when relevant:

- `pnpm agent:context <repo|api|web|shared>`
- `pnpm agent:verify <target> [check...]`
- `pnpm gapcode:bootstrap [origin/main] [--scope apps/api|apps/web|packages/*]`
- `pnpm doctor`
- `pnpm health`

## Dependency and Change Policy

- Before adding a dependency, inspect the nearest `package.json` for the target app/package.
- Do not add a new package if the repo already includes an equivalent capability.
- Keep changes local; avoid opportunistic refactors unless explicitly requested.
- If a shared package changes, validate the closest consumers rather than defaulting to all workspaces.
- Preserve established naming and file placement in the touched domain; do not introduce parallel patterns without need.
- Prefer extending existing DTOs, schemas, services, hooks, and helpers over creating siblings with overlapping responsibility.

## Edit Protocol

- Make the smallest production-grade change that fully solves the task.
- Keep business logic in services/domain layers and framework or persistence details in adapters/repositories/config.
- Do not rewrite large files to fix local issues; patch the narrowest stable seam.
- When behavior changes, add or update the nearest test if the project already tests that surface.
- When contracts change, verify the impact on both producer and nearest consumer.

## Validation Strategy

- Package-local first: lint, typecheck, test, then build only if the changed surface warrants it.
- Shared package changes: validate the package plus the nearest consuming app.
- Contract/schema changes: validate generation or integration steps only if the task touched them.
- If full verification is skipped for scope or runtime reasons, state exactly what remains optional.

## Output Style For This Repo

When responding to implementation requests, prefer this compact structure when it fits the task:

- `[PLAN]` short technical steps
- `[FILES]` touched paths
- `[TERM]` commands run or required
- `[CODE]` concise implementation notes or targeted diff guidance
- `[VERIFY]` exact verification commands
- `[NEXT]` one immediate next action

Do not pad responses with greetings, theory, or long rationale.

## Response Discipline

- Lead with the change outcome, not the investigation history.
- List only the files actually touched.
- List only commands actually run, plus any clearly marked optional follow-ups.
- Keep rationale brief and tied to impact, safety, or architecture.
- When blocked, state the blocker and the narrowest next action.

## Prohibitions

- No incomplete code snippets for code-change tasks.
- No `any`, `@ts-ignore`, or hidden type bypasses unless the user explicitly asks for a temporary workaround.
- No direct cross-package imports from another package's internal source tree.
- No manual path guessing when the structure is unclear.
- No root-wide validation by default if a package-scoped check is enough.

## Done Criteria

- Change is scoped to the affected area.
- Smallest meaningful validation has been run.
- Response lists changed files and commands actually used.
- Mention any broader validation that remains optional.
