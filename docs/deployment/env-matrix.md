# Environment Matrix

آخرین بازبینی: 2026-04-27

این فایل contract نسخه شده برای envهای ضروری DevAtlas است. هر startup باید با همین کلیدها قابل بالا آمدن باشد و نبودن کلیدهای required باید به fail-fast ختم شود.

| Variable | App | Local | Staging | Production | Notes |
| --- | --- | --- | --- | --- | --- |
| `NODE_ENV` | API | `development` | `production` | `production` | فقط `development`, `test`, `production` معتبر است |
| `PORT` | API | `3001` | platform-owned | platform-owned | فقط برای API لازم است |
| `APP_BASE_URL` | API | `http://localhost:3001` | public staging API URL | public production API URL | برای URLهای canonical و integrationهای بیرونی |
| `DATABASE_URL` | API | local Postgres URL | staging Postgres URL | production Postgres URL | required و fail-fast |
| `TEST_DATABASE_URL` | API test | local test DB URL | optional dedicated test DB | optional dedicated test DB | برای integration testها |
| `CORS_ORIGIN` | API | `http://localhost:3000` | staging web URL | production web URL | چند origin با `,` جدا می شوند |
| `CONTENT_DIR` | API jobs | repo fixture/content path | mounted content path | mounted content path | برای `content:ingest` و `db:seed` |
| `NEXT_PUBLIC_SITE_URL` | Web | `http://localhost:3000` | public staging web URL | public production web URL | برای metadata/canonical links و fail-fast |
| `NEXT_PUBLIC_API_BASE_URL` | Web | `http://localhost:3001` | public staging API URL | public production API URL | seam canonical برای fetchهای web |

## Startup Rules

- API در `ConfigModule` با `envSchema` روی `APP_BASE_URL` و `DATABASE_URL` fail-fast می کند.
- Web در `apps/web/lib/env.ts` روی `NEXT_PUBLIC_SITE_URL` و `NEXT_PUBLIC_API_BASE_URL` fail-fast می کند.
- تغییر هر env جدید باید همزمان در `.env.example`، app-local template، و این matrix ثبت شود.
