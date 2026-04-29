# Scripts Reference

> DevAtlas Platform — Canonical script definitions for all packages.
> Last updated: 1405/02/03 (2026-04-23)

---

## Root (Turborepo)

| Script          | Command                          | Description                              |
| --------------- | -------------------------------- | ---------------------------------------- |
| `build`         | `turbo run build`                | Build all packages                       |
| `dev`           | `turbo run dev`                  | Start all apps in dev mode               |
| `lint`          | `turbo run lint`                 | Lint all packages                        |
| `test`          | `turbo run test`                 | Run all tests                            |
| `typecheck`     | `turbo run typecheck`            | Type-check all packages                  |
| `clean`         | `turbo run clean`                | Remove build artifacts                   |
| `format`        | `prettier --write .`             | Format entire codebase                   |
| `format:check`  | `prettier --check .`             | Check formatting without writing         |
| `postinstall`   | `—`                              | No ORM engine prep needed with Drizzle   |
| `ops:alerts`    | `node scripts/ops-alert.mjs`     | Poll `GET /api/v1/health`, evaluate runtime alerts, fail fast by severity |
| `ingest:smoke`  | `node scripts/search-smoke.mjs --ingest-pipeline --require-positive` | Run canonical content ingest plus health/search smoke |
| `search:smoke`  | `node scripts/search-smoke.mjs`   | Run API smoke checks and optional pipeline smoke for search |
| `agent:ops`     | `node scripts/agent-ops.mjs`     | End-to-end local automation pass (doctor, verify, github inventory, optional deepseek/smoke) |
| `agent:autopilot` | `pnpm doctor && pnpm agent:github status --json && pnpm agent:inventory --json` | Lightweight startup pass for local-first continuity after each shift |
| `agent:smart`   | `node scripts/agent-smart.mjs`   | Lightweight adaptive agent: doctor, lint/typecheck/test, optional smoke/deepseek |
| `agent:auto`    | `node scripts/agent-smart.mjs`   | Alias for `agent:smart` |
| `agent:auto:offline` | `node scripts/agent-smart.mjs --offline` | Offline-safe autonomous mode (skip remote/deepseek) |
| `agent:deepseek:local` | `python3 scripts/deepseek-review.py --provider local` | Run local offline review using the configured OpenAI-compatible local model |
| `agent:local:chat` | `node scripts/local-llm.mjs chat` | Start the local `llama.cpp` chat server on the configured GPU |
| `agent:local:embed` | `node scripts/local-llm.mjs embed` | Start the local embedding server with `bge-m3.gguf` |
| `agent:local:smoke` | `node scripts/local-llm.mjs smoke` | Verify that the local chat endpoint is ready |
| `agent:local:smoke:embed` | `node scripts/local-llm.mjs smoke --mode=embed` | Verify that the local embedding endpoint is ready |
| `agent:devflow` | `node scripts/agent-devflow.mjs` | Central scoped hook/review/context orchestrator for local development |
| `agent:devflow:install-hooks` | `node scripts/agent-devflow.mjs install-hooks` | Install `.githooks` and set `core.hooksPath` |
| `agent:offline:install` | `bash scripts/install-offline-ai-services.sh` | Install user services and timers for offline AI automation |
| `agent:offline:review:last` | `cat tmp/agent-devflow/review-latest.json` | Read the latest offline review artifact |
| `agent:tools`   | `node scripts/agent-tools-audit.mjs` | Audit immediate availability of free GitHub/quality/automation/dev/monitoring/AI capabilities |
| `agent:preflight` | `node scripts/agent-preflight.mjs` | Combined readiness: doctor + network mode + VPS/env baseline; quick next command suggestion |
| `agent:vps`     | `node scripts/vps-audit.mjs` | Audit VPS reachability and deploy-readiness (host/key/remote script checks) |
| `deploy:staging` | `node scripts/deploy/staging-release.mjs` | Run the repo-driven staging deploy helper over SSH |
| `staging:data` | `node scripts/staging-data-rehearsal.mjs` | Run staging data lifecycle rehearsal: backup, seed, smoke, rollback-plan, restore |
| `staging:readiness` | `node scripts/staging-readiness.mjs` | Run staging deploy + optional staging data lifecycle rehearsal in one command |

Examples:

```bash
# smoke-only against local API
pnpm search:smoke -- --api http://127.0.0.1:3001 --query React

# run search:reindex and validate summary output too
pnpm search:smoke -- --api http://127.0.0.1:3001 --pipeline

# run content ingestion first, then health/search smoke
CONTENT_DIR=./packages/content/src/__tests__/fixtures pnpm search:smoke -- --api http://127.0.0.1:3001 --ingest-pipeline --require-positive

# canonical local ingest smoke with default fixture content
pnpm ingest:smoke -- --api http://127.0.0.1:3001

# staging data rehearsal (backup/restore is dry-run by default)
pnpm staging:data -- --api https://staging.alirezasafeidev.ir --content-dir ./packages/content/src/__tests__/fixtures

# full staging readiness drill (deploy + data rehearsal)
pnpm staging:readiness -- --sync-remote --smoke-query React --content-dir ./packages/content/src/__tests__/fixtures
```

Deployment flags:

- `--api <url>`: API base URL (default `http://127.0.0.1:3001` or `API_BASE_URL`)
- `--app-base-url <url>`: base URL injected into API jobs during `--ingest-pipeline` (default `APP_BASE_URL` or `--api`)
- `--query <text>`: search text to execute (default `React`)
- `--content-dir <path>`: content root for `--ingest-pipeline` (default `CONTENT_DIR` or `./packages/content/src/__tests__/fixtures`)
- `--require-positive`: enforce `search.total > 0` in smoke result
- `--pipeline`: runs `pnpm --filter @devatlas/api search:reindex` and validates machine-readable summary
- `--ingest-pipeline`: runs `pnpm --filter @devatlas/api content:ingest` and validates machine-readable summary before smoke checks
- `--insecure`: allow HTTPS requests to staging when self-signed cert is used

`staging:data` flags:

- `--api <url>`: API base URL for smoke checks (default `https://staging.alirezasafeidev.ir`)
- `--content-dir <path>`: content directory for canonical `db:seed` (default `CONTENT_DIR` or `./packages/content/src/__tests__/fixtures`)
- `--backup-file <path>`: override backup file path (default `./tmp/devatlas-staging-data-<timestamp>.sql`)
- `--execute-backup-restore`: run real backup/restore instead of dry-run for those two steps
- `--skip-seed`: skip `db:seed`
- `--seed-dry-run`: dry-run only for `db:seed`
- `--smoke-dry-run`: skip smoke checks
- `--require-positive`: pass `--require-positive` to smoke checks
- `--insecure`: allow HTTPS requests to staging when self-signed cert is used
- `--keep-backup`: keep the backup file when real restore was executed

`staging:readiness` flags:

- `--api <url>`: API base URL for smoke checks/data rehearsal
- `--content-dir <path>`: content directory for `staging:data` seed step
- `--smoke-query <text>`: smoke search query (default `React`)
- `--release-label <slug>`: release label forwarded to `deploy:staging`
- `--ref <sha-or-tag>`: redeploy a specific ref
- `--database-url <url>`: database URL for `staging:data`
- `--backup-file <path>`: override backup path forwarded to `staging:data`
- `--execute-backup-restore`: run real backup/restore in the rehearsal (default dry-run)
- `--seed-dry-run`: dry-run `db:seed` in rehearsal
- `--smoke-dry-run`: skip smoke checks in rehearsal
- `--require-positive`: pass through to smoke checks
- `--insecure`: allow HTTPS checks on self-signed staging cert
- `--keep-backup`: keep local rehearsal backup file
- `--skip-data-rehearsal`: skip `staging:data` stage
- `--artifact-dir <path>`: write execution manifest (default `./tmp/staging-readiness`)
- `--artifact-file <path>`: override manifest path
- `--dry-run`: print commands without executing deploy/data commands

Notes for `--ingest-pipeline`:

- `DATABASE_URL` must be set because the ingest job writes into Postgres
- `APP_BASE_URL` is auto-filled from `--api` when not set explicitly

Offline AI notes:

- `agent:local:chat` uses `llama.cpp` + Vulkan and is tuned for the local AMD RX 580.
- `agent:deepseek:local` defaults to `LOCAL_REVIEW_BASE_URL` and `LOCAL_REVIEW_MODEL` when present in `.env.local`.
- `agent:devflow` derives API/Web/Shared scope from changed files, writes reports under `tmp/agent-devflow/` and `artifacts/agent-devflow/`, and powers the Git hooks.
- `agent:offline:install` installs `systemd --user` services for `Ollama`, `llama.cpp`, a 30-minute smoke timer, a daily local review timer, and enables `.githooks`.

Staging deploy helper examples:

```bash
# smoke-only against the current staging release with temporary TLS
pnpm deploy:staging -- --skip-deploy --insecure

# sync remote repo snapshot on the VPS, deploy, then run public smoke checks
pnpm deploy:staging -- --sync-remote --release-label <slug> --smoke-query React --insecure
```

Observability checks:

```bash
# external poller for staging API health alerts
pnpm ops:alerts -- --api https://staging.alirezasafeidev.ir
```

```bash
# machine-readable output (for CI/crons)
pnpm ops:alerts -- --api https://staging.alirezasafeidev.ir --fail-on warn --json
```

Flags:

- `--api <url>`: API base URL (default `https://staging.alirezasafeidev.ir` or `OBS_API_URL`)
- `--fail-on <critical|warn|none>`: fail condition (default `critical`)
- `--timeout-ms <ms>`: request timeout for `/api/v1/health` (default `10000`)
- `--json`: machine-readable output for alert pipelines
- `--verbose`: print all checks (warn/info + ok)

Deployment flags:

- `--sync-remote`: refresh the VPS repo snapshot from remote before building
- `--ref <git-ref>`: deploy a specific remote ref on the VPS
- `--skip-deploy`: run smoke checks only
- `--smoke-query <text>`: query used by built-in search smoke (`default: React`)
- `--insecure`: allow smoke checks against the current self-signed staging cert

### Notes

- `postinstall` no longer runs any ORM engine preparation. Drizzle has no binary engine dependency.
- All Turbo tasks respect the dependency graph defined in `turbo.json`.

---

## apps/api

### Core Scripts

| Script       | Command                                    | Description                    |
| ------------ | ------------------------------------------ | ------------------------------ |
| `build`      | `tsc --project tsconfig.build.json --outDir dist --incremental false` | Production build |
| `dev`        | `nest start --watch`                       | Dev server with hot reload     |
| `start`      | `node dist/main.js`                        | Start production server        |
| `lint`       | `eslint src --ext .ts --max-warnings=0`   | Lint — zero warnings allowed   |
| `test`       | `vitest run --passWithNoTests --config vitest.config.ts` | Run all tests (single run) |
| `test:watch` | `vitest`                                   | Run tests in watch mode        |
| `test:cov`   | `vitest run --coverage`                    | Run tests with coverage        |
| `typecheck`  | `tsc --noEmit`                             | Type-check without emitting    |

### Database Scripts (Drizzle)

| Script        | Command                                            | Description |
| ------------- | -------------------------------------------------- | ----------- |
| `db:generate` | `drizzle-kit generate --config src/db/drizzle.config.ts` | Generate a new SQL migration from the current schema |
| `db:migrate`  | `ts-node --project tsconfig.json src/db/migrate.ts`  | Apply pending migrations to the target database with fail-fast env/path checks |
| `db:check`    | `drizzle-kit check --config src/db/drizzle.config.ts`    | Validate migration history against the schema output |
| `db:export`   | `drizzle-kit export --config src/db/drizzle.config.ts`   | Export the full schema diff as SQL from the current state |
| `db:seed`     | `ts-node --project tsconfig.json src/scripts/db-seed.ts` | Run the canonical content-backed seed flow using `CONTENT_DIR` |
| `db:rollback:plan` | `ts-node --project tsconfig.json src/scripts/db-rollback-plan.ts` | Print the compensating-migration rollback checklist for the latest Drizzle migration |
| `content:ingest` | `ts-node --project tsconfig.json src/scripts/ingest-content.ts` | Parse MDX content from `CONTENT_DIR` and upsert categories/tags/guides/tools plus relations and search documents |
| `search:reindex` | `ts-node --project tsconfig.json src/scripts/reindex-search.ts` | Rebuild `search_documents` explicitly instead of doing index work on read traffic |
| `search:verify` | `vitest run --passWithNoTests --config vitest.config.ts src/modules/search/__tests__/search.service.spec.ts src/modules/search/__tests__/search-indexing.service.spec.ts src/modules/__tests__/api-contract.spec.ts` | Run production-grade search contract + service + indexing checks |

در اجرای `search:reindex`، خروجی machine-readable شامل خلاصهٔ تعداد بازسازی شده ارسال می‌شود:

```json
{"event":"search-reindex-complete","summary":{"guides":42,"tools":18,"total":60}}
```

اجرای production-like دیتابیس در این repo باید این ترتیب را دنبال کند:

1. `pnpm --filter @devatlas/api db:generate`
2. migration SQL را بازبینی و commit کنید
3. `pnpm --filter @devatlas/api db:check`
4. `pnpm --filter @devatlas/api db:migrate`
5. `pnpm --filter @devatlas/api db:seed` after setting `CONTENT_DIR`
6. `pnpm --filter @devatlas/api search:reindex` only when you need to rebuild `search_documents` from DB state without re-importing content

برای rollback، مسیر canonical همچنان migration جبرانی جدید است، نه ویرایش migrationهای commit شده. قبل از rollback plan این دستور را اجرا کنید:

```bash
pnpm --filter @devatlas/api db:rollback:plan
```

نکات عملیاتی:

- `db:seed` به `CONTENT_DIR` نیاز دارد و flow رسمی ingest را اجرا می کند.
- اگر بعد از seed نیاز به rebuild صریح search داشتید، `SEARCH_REINDEX_AFTER_SEED=1 pnpm --filter @devatlas/api db:seed` را اجرا کنید.
- `db:migrate` حالا از `src/db/migrate.ts` اجرا می شود تا `DATABASE_URL` و مسیر `drizzle/` را fail-fast چک کند.

### Runtime Security Baseline

- `CORS_ORIGIN` می تواند یک origin یا چند origin جداشده با `,` باشد
- `RATE_LIMIT_WINDOW_MS` پنجره rate limit را برای endpointهای عمومی مشخص می کند
- `RATE_LIMIT_SEARCH_MAX` سقف درخواست `POST /api/v1/search` را در هر پنجره مشخص می کند
- `RATE_LIMIT_AI_MAX` سقف درخواست endpointهای `ai` را در هر پنجره مشخص می کند
- API به صورت baseline این headerها را ست می کند: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Permissions-Policy`

نمونه env production-like:

```bash
CORS_ORIGIN=https://devatlas.app,https://staging.devatlas.app
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_SEARCH_MAX=30
RATE_LIMIT_AI_MAX=10
```

---

## apps/web

| Script       | Command                          | Description                    |
| ------------ | -------------------------------- | ------------------------------ |
| `build`      | `node ../../scripts/link-next-eslint.mjs && next build` | Production build |
| `dev`        | `next dev`                       | Dev server                     |
| `start`      | `next start`                     | Start production server        |
| `lint`       | `eslint . --max-warnings=0`     | Lint — zero warnings allowed   |
| `test`       | `vitest run --passWithNoTests --config vitest.config.ts` | Run all tests |
| `typecheck`  | `tsc --noEmit`                   | Type-check without emitting    |

---

## packages/types

| Script      | Command          | Description                 |
| ----------- | ---------------- | --------------------------- |
| `build`     | `tsup src/index.ts --dts --format esm,cjs --clean` | Compile runtime + type declarations |
| `typecheck` | `tsc -p tsconfig.json --noEmit` | Type-check |
| `lint`      | `eslint src --ext .ts --max-warnings=0` | Lint |

---

## packages/ui

| Script      | Command                      | Description                 |
| ----------- | ---------------------------- | --------------------------- |
| `build`     | `tsup`                       | Bundle components           |
| `dev`       | `tsup --watch`               | Watch mode                  |
| `lint`      | `eslint . --max-warnings=0` | Lint                        |
| `typecheck` | `tsc --noEmit`               | Type-check                  |
| `test`      | `vitest run`                 | Run component tests         |

---

## Drizzle Configuration

فایل `drizzle.config.ts` در پکیج `apps/api`:

```ts
// filepath: apps/api/src/db/drizzle.config.ts
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'],
  },
  verbose: true,
  strict: true,
});
```

---

## CI Pipeline Scripts

CI این مراحل رو به ترتیب اجرا می‌کنه:

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

- CI فعلی فقط از `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` استفاده می‌کند.
- هر مرحله migration یا DB setup باید فقط وقتی به workflow اضافه شود که اسکریپت واقعی repo برای آن وجود داشته باشد.

---

## Script Rules

1. هر پکیج **باید** اسکریپت‌های `build`, `lint`, `typecheck` رو داشته باشه.
2. `test` از `vitest run` استفاده می‌کنه — نه watch mode.
3. `lint` با `--max-warnings=0` — هیچ warning ای قابل قبول نیست.
4. اسکریپت مرده یا موقت ممنوع — حذفش کن یا issue بزن.
5. اسکریپت‌های `db:*` فقط وقتی باید مستند شوند که واقعا در `apps/api/package.json` وجود داشته باشند.
6. هیچ دستور منسوخ Prisma یا Drizzle-placeholder نباید در CI یا docs باقی بماند.

---

## scripts/doctor.mjs

این اسکریپت سلامت کل monorepo را بررسی می‌کند:

- نسخه Node
- نصب بودن pnpm
- سالم بودن lockfile
- عدم وجود بسته‌های duplicated
- اعتبار tsconfig.base.json
- بررسی turbo cache

### اجرا:
```bash
pnpm doctor
```
