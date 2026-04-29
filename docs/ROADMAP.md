# DevAtlas Production Roadmap

آخرین بازبینی: 1405/02/02 (2026-04-22)
وضعیت مبنا: بر اساس ساختار واقعی ریپو، اسکریپت های `package.json`، مسیرهای فعال `apps/api` و `apps/web`، و آرتیفکت های موجود در `infra/docker`

این فایل تنها منبع تصمیم گیری برای اجرای پروژه تا رسیدن به استقرار production است. هدف این roadmap اضافه کردن «مستندات بیشتر» نیست؛ هدف، تبدیل وضعیت فعلی ریپو به یک محصول قابل استقرار، قابل پشتیبانی و قابل توسعه است.

---

## 1) خط مبنا

### آنچه الان واقعا داریم
- monorepo با `pnpm` و `turbo`
- API مبتنی بر NestJS با ماژول های `guides`, `tools`, `categories`, `tags`, `search`, `content-relations`, `ai`, `health`, `database`
- Web مبتنی بر Next.js با routeهای `/`, `/guides`, `/guides/[slug]`, `/tools`, `/tools/[slug]`, `/categories`
- shared packages شامل `@devatlas/api-client`, `@devatlas/content`, `@devatlas/types`, `@devatlas/ui`, `@devatlas/utils`, `@devatlas/config`
- Docker artifacts در `infra/docker/` برای API و Web
- اسکریپت های تایید محلی: `pnpm verify:api`, `pnpm verify:web`, `pnpm doctor`, `pnpm health`

### شکاف های واقعی تا production
- مسیر ingestion واقعی برای `@devatlas/content` هنوز به چرخه عملیاتی API/Search وصل نشده
- تجربه Search در Web هنوز route عملیاتی و کامل ندارد
- قرارداد env و runbook دیتابیس برای migration / rollback هنوز production-grade نیست
- لایه امنیت baseline برای abuse protection, env contract, rate limit و secret handling کامل نشده
- observability خارجی، alerting و runbook incident هنوز نداریم
- CI/CD تا staging/prod به شکل عملیاتی و قابل تکرار کامل نشده
- بازسازی ایندکس Search باید explicit و عملیاتی بماند؛ کار سنگین index نباید روی read-path هر درخواست اجرا شود
- ingest محتوا باید از MDX به DB/Search/Relations با یک command عملیاتی قابل تکرار انجام شود، نه با import دستی داده

### چیزهایی که فعلا هدف نیست
- فیچرهای جدید محتوایی خارج از `guides/tools/search`
- توسعه AI فراتر از seam فعلی
- refactorهای سلیقه ای یا جابه جایی معماری بدون اثر مستقیم روی production-readiness

---

## 2) اصول اجرا

- هر فاز باید خروجی deployable داشته باشد، نه صرفا code complete.
- هر task باید مالک، معیار پذیرش، و دستور verify مشخص داشته باشد.
- تا وقتی ingest/search/security/deploy واقعی نشده، roadmap «پیشرفت ظاهری» محسوب نمی شود.
- هر تغییر shared باید نزدیک ترین consumer را هم validate کند.
- اگر یک مورد در roadmap معیار قابل اندازه گیری ندارد، هنوز آماده اجرا نیست.

## 2.1) استمرار کار وقتی نظارت مستقیم نیست

- هر روز به‌محض شروع، دستور `pnpm agent:preflight --json` را اجرا کنید تا حالت (offline/online) تعیین شود.
- مسیر پیش‌فرض توسعه:
  - `pnpm agent:auto:offline` یا `pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD` بسته به پیشنهاد `preflight`.
  - سپس `pnpm agent:autopilot` و ذخیره خروجی برای audit جلسه.
- قبل از اینکه هر آیتم roadmap تغییر کند، ابتدا `docs/ROADMAP.md` آیتم مربوط را به‌روزرسانی کنید (`InProgress` / `Blocked` / `Done`) و معیار پذیرش را حفظ کنید.
- اگر تغییر روی contracts باشد، `pnpm agent:deepseek:local --file <file>` برای بازبینی سریع و رایگان انجام شود.
- هیچ مرحله‌ای به‌صورت «خالی» (بدون خروجی verify یا artifact) انجام نشود؛ خروجی را در `tmp/agent-*` بگذارید تا پیگیری امکان‌پذیر باشد.

---

## 3) ترتیب واقعی اجرا

## Phase 1 — Platform Baseline Stabilization

هدف: baseline پروژه را طوری تثبیت کنیم که توسعه روزمره و release بعدی روی زمین سفت انجام شود.

### 1.1 دیتابیس و lifecycle عملیاتی Drizzle
- تکمیل اسکریپت های رسمی DB در `apps/api/package.json`
- تثبیت workflowهای `generate`, `migrate`, `check`, `seed` و rollback
- حذف یا تعیین تکلیف artifactهای باقیمانده غیرلازم مثل مسیرهای legacy دیتابیس
- وضعیت فعلی:
  - اسکریپت های رسمی `db:migrate`, `db:seed`, `db:rollback:plan` در `apps/api/package.json` ثبت شده اند
  - `db:migrate` با fail-fast روی `DATABASE_URL` و مسیر canonical `drizzle/` اجرا می شود
  - rollback به صورت migration جبرانی در `docs/deployment/database-runbook.md` و `db:rollback:plan` operational شده است
- معیار پذیرش:
  - تیم بتواند local و staging را فقط با اسکریپت های رسمی repo بالا بیاورد
  - migration جدید بدون دستورهای دستی پراکنده قابل اجرا و rollback باشد
- verify:
  - `pnpm --filter @devatlas/api typecheck`
  - `pnpm --filter @devatlas/api test`

### 1.2 قرارداد env و bootstrap واقعی
- تکمیل `.env.example` برای API و Web
- تعریف contract حداقلی env: `DATABASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, app URLs, logging/telemetry vars
- fail-fast برای env ناقص در startup
- وضعیت فعلی:
  - templateهای versioned در `.env.example`, `apps/api/.env.example`, `apps/web/.env.example` هم راستا شدند
  - API روی `APP_BASE_URL` و `DATABASE_URL` در startup fail-fast می کند
  - Web روی `NEXT_PUBLIC_SITE_URL` و `NEXT_PUBLIC_API_BASE_URL` در startup fail-fast می کند
  - matrix محیط ها در `docs/deployment/env-matrix.md` ثبت شده است
- معیار پذیرش:
  - اجرای local بدون حدس زدن env ممکن باشد
  - staging/prod env matrix شفاف و versioned باشد
- verify:
  - `pnpm doctor`
  - startup محلی API و Web با env template تکمیل شده

### 1.3 تثبیت CI روی وضعیت واقعی repo
- بازبینی workflowها برای استفاده از اسکریپت های واقعی package-scoped و root
- اضافه کردن مسیر verify سریع برای PR و مسیر verify کامل برای release
- جلوگیری از drift بین CI و اسکریپت های local
- وضعیت فعلی:
  - GitHub Actions روی مسیر سریع `pnpm doctor`, `pnpm verify:api`, `pnpm verify:web` هم راستا شد
  - pushها علاوه بر مسیر سریع، release gate کامل `pnpm lint && pnpm typecheck && pnpm test && pnpm build` را اجرا می کنند
  - envهای لازم برای API/Web در CI versioned و صریح شدند تا bootstrap با local scripts drift نکند
  - workflow موازی GitLab هم به همین contract ها و نسخه `pnpm@10.33.2` sync شد
- معیار پذیرش:
  - CI دقیقا همان چیزهایی را اجرا کند که تیم محلی اجرا می کند
  - build شکسته یا test شکسته قبل از merge متوقف شود
- verify:
  - `pnpm verify:api`
  - `pnpm verify:web`

خروجی این فاز: یک baseline قابل اتکا برای توسعه و release بدون وابستگی به دانش ضمنی

---

## Phase 2 — Product Core Completion

هدف: سه مسیر اصلی محصول را عملیاتی کنیم: content ingestion، search، و surface وب برای استفاده واقعی.

### 2.1 اتصال `@devatlas/content` به چرخه داده واقعی
- تعریف یک entrypoint واقعی برای ingestion: CLI job یا admin-only workflow
- ذخیره خروجی ingest در جداول search/content relations/API
- پشتیبانی از reindex incremental و full rebuild
- وضعیت فعلی:
  - entrypoint رسمی `pnpm --filter @devatlas/api content:ingest` فعال است و از `CONTENT_DIR` به عنوان contract استفاده می کند
  - ingest خروجی `@devatlas/content` را در جداول `guides/tools`, `content_relations`, `search_documents` sync می کند
  - ingest حالا summary ماشین خوان `{"event":"content-ingest-complete","summary":...}` برای smoke/ops منتشر می کند
  - integration test نزدیک این flow در `apps/api/src/scripts/ingest-content.spec.ts` اضافه شده و در صورت وجود `TEST_DATABASE_URL` این مسیر را تا API/search validate می کند
- معیار پذیرش:
  - داده جدید بدون دستکاری دستی در DB وارد سیستم شود
  - پس از ingest، داده در API و search قابل مشاهده باشد
- verify:
  - تست integration برای ingest → index → search
  - `pnpm --filter @devatlas/api test`

### 2.2 تکمیل Search end-to-end
- اضافه کردن route عملیاتی Search در Web
- استفاده از seam واحد `apps/web/lib/api-client.ts`
- پیاده سازی loading, empty, error, query-state و URL persistence
- معیار پذیرش:
  - کاربر از Web جستجو کند و نتیجه guide/tool ببیند
  - رفتار search بین API و Web drift نداشته باشد
- verify:
  - `pnpm test:web`
  - `pnpm build:web`

وضعیت فعلی:
- `route /search` فعال است و با `apps/web/lib/api-client.ts` یکپارچه شده
- query-state و persistence از URL انجام می‌شود
- حالت های loading (`loading.tsx`) و error (`error.tsx`) برای تجربه کاربر اضافه شده‌اند
- محدودیت طول کوئری و پیام خطای کنترل‌شده در صفحه search برای UX production-grade اعمال شد
- `search:reindex` در API یک خروجی سازگار با observability تولید می‌کند:
  - `{"event":"search-reindex-complete","summary":{"guides":<n>,"tools":<m>,"total":<n+m>}}`
- برای smoke/staging validation اسکریپت های canonical `pnpm search:smoke` و `pnpm ingest:smoke` در سطح root اضافه شدند (موارد `--api`, `--query`, `--pipeline`, `--ingest-pipeline`, `--content-dir`).

### 2.3 تثبیت contracts بین API و Web
- بازبینی routeها و DTOهای consumer-facing برای `guides`, `tools`, `categories`, `search`
- حذف fetchهای پراکنده باقیمانده و enforce کردن API client واحد
- افزودن validation نزدیک مرز client/server
- معیار پذیرش:
  - contract change بدون شکستن consumer شناسایی شود
  - web surface فقط از مسیر canonical داده مصرف کند
- verify:
  - `pnpm typecheck:web`
  - `pnpm test:api`

خروجی این فاز: محصولی که محتوای واقعی ingest می کند، search دارد، و مسیرهای اصلی Web/API آن operational هستند

---

## Phase 3 — Security and Reliability Baseline

هدف: قبل از هر استقرار واقعی، سطح حداقلی امنیت و پایداری را enforce کنیم.

### 3.1 hardening ورودی ها و abuse protection
- rate limit برای endpointهای `search` و `ai`
- sanitize/validate برای query inputs و payloadها
- بازبینی CORS و response headers
- وضعیت فعلی:
  - روی `POST /api/v1/search` و endpointهای `ai` rate limit قابل تنظیم از env فعال شده
  - ورودی های عمومی `search` و `ai` با حد طول/بازه سخت تر validate می شوند
  - baseline response headers امنیتی و CORS چند-origin از env اعمال می شود
- معیار پذیرش:
  - endpointهای عمومی در برابر abuse ابتدایی محافظت شوند
  - ورودی نامعتبر به response کنترل شده و قابل رصد ختم شود
- verify:
  - تست validation/error-path برای API
  - `pnpm verify:api`

### 3.2 observability قابل استفاده
- استانداردسازی log fields و correlation ids
- افزودن metric برای latency, DB, search, error rate
- تعریف seam برای exporter/monitoring backend
- وضعیت فعلی:
  - لاگ های API روی خطاها `traceId` و `errorCode` را کنار route و status ثبت می کنند
  - health metrics علاوه بر latency، `errorRate`، `validationFailures` و `rateLimitedRequests` را هم گزارش می کند
  - endpoint جدید `GET /api/v1/health/metrics` خروجی scrape-friendly برای readiness, error rate, latency, route metrics و alert gauges می دهد
  - alert baseline برای `database readiness`, `error rate`, `latency proxy`, و `rate-limited requests` داخل exporter محاسبه می شود
- معیار پذیرش:
  - بتوان latency و failure را روی API/Web تشخیص داد
  - health فقط heartbeat نباشد و به عملیات کمک کند
- verify:
  - `pnpm health`
  - smoke test endpointهای health/search

### 3.3 runbook عملیاتی
- مستندسازی release order, migration order, rollback, smoke checks
- مشخص کردن owner و گام های incident response اولیه
- معیار پذیرش:
  - release بدون تکیه بر حافظه فردی قابل اجرا باشد
  - rollback در کمتر از چند گام روشن باشد
- verify:
  - dry-run روی staging checklist

خروجی این فاز: سیستم از حالت «قابل اجرا روی لپتاپ» به «قابل استقرار و قابل پشتیبانی» می رسد

---

## Phase 4 — Staging Readiness

هدف: staging را به محیط واقعی تمرین release تبدیل کنیم، نه صرفا یک deploy نمایشی.

### 4.1 تکمیل Docker و startup production-like
- تثبیت Dockerfileهای API/Web و `docker-compose`
- healthcheck و startup command واقعی
- تضمین سازگاری build artifactها با env contract
- معیار پذیرش:
  - `docker compose up --build` محیط کامل سرویس ها را بالا بیاورد
  - health endpoints بعد از boot پایدار باشند
- verify:
  - `docker compose -f infra/docker/docker-compose.yml config`
  - smoke test compose بالا آمده

### 4.2 pipeline استقرار staging
- ساخت workflow build/publish/deploy برای branch یا tag مشخص
- ثبت artifact قابل ردیابی با commit SHA
- اجرای smoke test بعد از deploy
- معیار پذیرش:
  - یک push مشخص به staging قابل انتشار و قابل rollback باشد
  - artifact و version هر deploy قابل رهگیری باشد
- verify:
  - اجرای staging deploy dry-run یا release candidate deploy

### 4.3 داده و عملیات staging
- دیتابیس staging با migration workflow واقعی
- seed حداقلی برای smoke و regression
- backup/restore rehearsal در حد baseline
- معیار پذیرش:
  - staging از نظر lifecycle دیتابیس شبیه production باشد
  - release روی staging همان مسیر production را تمرین کند

خروجی این فاز: staging محیطی می شود که واقعاً readiness تولید را اثبات می کند

---

## Phase 5 — Production Cutover

هدف: اولین استقرار production را با حداقل ریسک و حداکثر قابلیت بازگشت انجام دهیم.

### 5.1 pre-production gate
- اجرای full verify روی candidate نهایی
- load baseline برای list/detail/search
- dependency audit و secret scan
- معیار پذیرش:
  - `pnpm lint && pnpm typecheck && pnpm test && pnpm build` سبز باشد
  - bottleneckهای واضح قبل از cutover شناسایی شده باشند

### 5.2 launch checklist
- تایید health, logging, alerting, backup, rollback, DNS/SSL, env parity
- تایید owner برای release window و incident handling
- معیار پذیرش:
  - هیچ dependency عملیاتی بحرانی بدون owner یا runbook نمانده باشد

### 5.3 controlled production release
- deploy مرحله ای
- smoke test فوری بعد از release
- مانیتور کردن error rate, latency, readiness, DB saturation
- معیار پذیرش:
  - سیستم بعد از release پایدار بماند
  - rollback در صورت failure کمتر از یک runbook استاندارد نیاز داشته باشد

خروجی این فاز: production واقعی با release process، monitoring، و rollback عملیاتی

---

## 4) بک لاگ اجرایی اولویت دار

این ها کارهایی هستند که باید قبل از هر feature جدید انجام شوند:

| Priority | Item | چرا الان مهم است |
|---|---|---|
| P0 | Drizzle lifecycle + env contract | بدون این مورد، deploy و migration قابل اتکا نیست |
| P0 | Content ingestion real pipeline | بدون داده واقعی، search و AI نمایشی می مانند |
| P0 | API integration/error-path tests برای search + search-results | quality gate برای مسیر اصلی تا phase 2 کامل نشده است |
| P1 | Security baseline | قبل از public exposure باید abuse و input risk کنترل شود |
| P1 | Observability exporter + alerts | production بدون detection عملا قابل پشتیبانی نیست |
| P1 | Staging deploy pipeline | بدون staging واقعی، production rollout پرریسک است |
| P2 | Load/security validation | برای cutover نهایی لازم است، نه برای شروع توسعه |

### 4.1) صف اجرای پیشنهادی

ترتیب زیر، ترتیب اجرایی canonical برای ادامه کار است. اگر تیم کوچک است، فقط آیتم های `Now` را همزمان باز کنید. آیتم جدید نباید خارج از این صف شروع شود مگر اینکه blocker عملیاتی را باز کند.

| Queue | Priority | Task | Owner | Depends On | Acceptance Snapshot | Verify |
|---|---|---|---|---|---|---|
| Done | P0 | DB-01: تکمیل lifecycle رسمی Drizzle برای `generate/check/migrate/seed/rollback` | API | - | local و staging از flow رسمی repo استفاده می کنند؛ rollback به صورت migration compensating و runbook روشن شده است | `pnpm --filter @devatlas/api typecheck && pnpm --filter @devatlas/api test` |
| Done | P0 | ENV-01: تکمیل env contract و fail-fast برای API/Web | Platform | DB-01 | `.env.example` کامل است؛ startup روی env ناقص fail می کند؛ matrix محیط ها versioned شده است | `pnpm doctor` |
| Now | P0 | INGEST-01: اتصال ingestion واقعی `@devatlas/content` به DB/relations/search | API | DB-01, ENV-01 | ingest بدون دستکاری دستی DB انجام می شود؛ summary ماشین خوان دارد؛ smoke canonical از طریق `pnpm ingest:smoke` قابل اجرا است؛ داده بعد از ingest در API/search دیده می شود | `pnpm --filter @devatlas/api test` |
| Now | P0 | SEARCH-TEST-01: integration/error-path tests برای search و search-results | API | INGEST-01 | happy path و error path جستجو quality gate دارند؛ whitespace-only query قبل از search reject می شود؛ query logging و DTO boundaries پوشش داده شده اند | `pnpm verify:api` |
| Done | P1 | CI-01: هم راستاسازی CI با `verify:api` و `verify:web` | Platform | SEARCH-TEST-01 | PR path با `doctor/verify:api/verify:web` و push path با release gate کامل دقیقا از scriptهای repo استفاده می کنند | `pnpm verify:api && pnpm verify:web` |
| Next | P1 | OBS-01: exporter/alerts برای latency, error rate, readiness, DB saturation | Platform | ENV-01 | failure detection بدون SSH ممکن باشد و alert حداقلی فعال شود | `pnpm health` |
| Next | P1 | RUNBOOK-01: runbook عملیاتی release/migration/rollback/incident | Platform | DB-01, ENV-01, OBS-01 | release و rollback بدون دانش شفاهی قابل اجرا باشند | dry-run روی staging checklist |
| Next | P1 | STAGING-PIPE-01: pipeline قابل ردیابی staging با artifact و commit SHA | Platform | CI-01, RUNBOOK-01 | deploy staging قابل رهگیری، smoke و rollback باشد | `pnpm deploy:staging -- --skip-deploy --insecure` |
| Later | P1 | STAGING-DATA-01: seed, backup/restore rehearsal و DB lifecycle شبیه prod | Platform | STAGING-PIPE-01 | staging از نظر data lifecycle شبیه production شود | staging dry-run |
| Later | P2 | CUTOVER-01: load baseline, dependency audit, secret scan, launch checklist | Platform | همه آیتم های قبلی | release candidate برای production gate آماده باشد | `pnpm lint && pnpm typecheck && pnpm test && pnpm build` |

### 4.2) قانون انتخاب کار بعدی

- اگر `DB-01` done نشده، هیچ task جدید deploy/data را شروع نکنید.
- اگر ingest هنوز manual است، feature جدید روی search یا AI باز نکنید.
- اگر `SEARCH-TEST-01` سبز نیست، release candidate نسازید.
- اگر alerting و runbook نداریم، staging را production-ready تلقی نکنید.
- اگر pipeline staging artifact traceability ندارد، production cutover را شروع نکنید.

---

## 5) Definition of Done برای هر فاز

یک فاز فقط وقتی done است که همه موارد زیر برقرار باشند:
- کد merge شده باشد
- verifyهای همان surface اجرا و سبز باشند
- runbook یا contract مرتبط به روز شده باشد
- نزدیک ترین consumer یا deployment path validate شده باشد
- مورد جدید نیاز به توضیح شفاهی برای اجرا نداشته باشد

---

## 6) دستورات استاندارد verify

### API
```bash
pnpm verify:api
```

### Web
```bash
pnpm verify:web
```

### Repository-wide release gate
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

### Health checks
```bash
pnpm doctor
pnpm health
```

---

## 7) سیاست نگهداری roadmap

- هر سند اجرایی موازی که همین اطلاعات را تکرار کند باید حذف شود.
- اگر task جدید به این roadmap اضافه شد، باید در یکی از phaseهای بالا جا بگیرد؛ backlog پراکنده ممنوع است.
- وضعیت هر آیتم باید با شواهد کد، اسکریپت یا محیط اجرا به روز شود؛ نه بر اساس برداشت کلی.
- این فایل باید کوتاه، اجرایی و production-facing بماند.
