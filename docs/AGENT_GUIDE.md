# راهنمای استفاده از Agent Automation

این راهنما برای ادامه‌دادن توسعه به‌صورت `autonomous` طراحی شده و هدفش کم‌کردن زمان تکرار و مصرف توکن است.

## 1) شروع (هر بار از صفر)

1. `pnpm install` (در صورت تغییر lockfile)
2. چک سریع محیط: `pnpm doctor`
3. اجرای loop محلی:
   - آفلاین/بدون اینترنت: `pnpm agent:auto:offline`
   - آنلاین و آماده بازبینی: `pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD`
   - شروع سریع هر جلسه (کم‌توکن): `AGENT_LOW_TOKEN_MODE=1 pnpm agent:preflight --json`
4. ثبت ابزارهای قابل‌استفاده و تصمیم شروع:
   - `pnpm agent:tools --json`
   - `pnpm agent:autopilot`

## 2) نقشه راه اجرا (بر اساس اولویت)

### مرحله A — کیفیت پایه (همیشه قبل از هر تغییر)
- `pnpm lint:api`
- `pnpm typecheck:api`
- `pnpm test:api`
- `pnpm lint:web`
- `pnpm typecheck:web`
- `pnpm test:web`

### مرحله B — گیت‌هات و امنیت
- Dependabot: `.github/dependabot.yml`
- CodeQL: `.github/workflows/codeql.yml`
- Dependency Review: `.github/workflows/dependency-review.yml`
- Audit خودکار: `.github/workflows/github-ops.yml`
- Guard برای PR: `.github/workflows/agent-ops-guard.yml`

### مرحله C — اتوماسیون هوشمند
- inventory پروژه: `pnpm agent:inventory > /tmp/agent-inventory.json`
- وضعیت workflowها: `pnpm agent:github status`
- بازبینی Diff: `pnpm agent:deepseek --diff HEAD~1..HEAD --json`

## 3) فرمان‌های اجرایی پیشنهادی

### حالت آفلاین (کم‌هزینه)
```bash
pnpm agent:auto:offline
```
- فقط lint/typecheck/test محلی و بررسی‌های داخلی را می‌زند.

### حالت کم‌توکن (local-first)
```bash
AGENT_LOW_TOKEN_MODE=1 pnpm agent:auto:lean
```
- چک‌های پایه را بدون network اجرا می‌کند.
- review را با مدل لوکال انجام می‌دهد تا دخالت انسانی/توکن اینترنتی کاهش پیدا کند.

### حالت متصل
```bash
pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD
```
- اگر توکن DeepSeek موجود باشد در صورت نیاز بازبینی هوشمند انجام می‌دهد.

### اجرای کامل برای audit دستی
```bash
pnpm agent:ops --smoke --deepseek --deepseek-diff HEAD~1..HEAD --report tmp/agent-ops-report.json --json
```
- خروجی JSON برای مانیتورینگ یا ذخیره‌سازی artifact مناسب است.

## 4) مدیریت توکن و خروجی

- وقتی اینترنت ندارید یا فقط ادامه توسعه local لازم است، از `--offline` استفاده کنید.
- خروجی‌های حجیم را فقط وقتی لازم است تولید کنید (`--json` روی اسکریپت‌های agent برای اتوماسیون). 
- برای کارهای روزمره، `pnpm agent:auto:offline` کافی است و سبک‌ترین مسیر است.
- برای شروع خودکار کم‌هزینه، `AGENT_LOW_TOKEN_MODE=1 pnpm agent:preflight --json` را بزنید تا مستقیم به offline بچرخد.
- برای شروع هر جلسه اجرایی بدون تایید دستی: `pnpm agent:preflight --json` و سپس حالت پیشنهادی `agent` را اجرا کنید.

## 5) ادامه‌دادن توسعه بدون حضور دائمی شما

- وقتی بدون هماهنگی مستقیم با شما کار می‌کنید، این ترتیب را ثابت نگه دارید:
  1) `pnpm agent:preflight --json` (تشخیص وضعیت)
 2) بر اساس `recommendedMode` اجرا کنید:
     - `offline` → `pnpm agent:auto:offline`
     - `online` → `pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD`
     - اگر `AGENT_LOW_TOKEN_MODE=1` است → `pnpm agent:auto:lean`
  3) یک‌مرحله به‌سرعت وضعیت roadmap را sync کنید:
     - اگر کار به یک آیتم roadmap مربوط است، متن مرتبط را به `docs/ROADMAP.md` علامت‌گذاری کنید.
  4) گزارش اتوماسیون را ذخیره کنید: `pnpm agent:autopilot > tmp/agent-autopilot-$(date +%F).log`
- خروجی‌های مهم را همیشه در فایل بگذارید و حذف نکنید؛ این یعنی «کامپکت نکردن» تصمیمات.
- برای بازبینی هوشمند رایگان روی local: `pnpm agent:deepseek:local --diff HEAD~1..HEAD --json`.

برای هر تصمیم جدید قبل از تغییر contractهای API/DB/Web:
`pnpm agent:context --scope roadmap > /tmp/agent-context-roadmap.json`.
برای ادامه‌ی دقیق‌تر در غیبت تیم انسانی:
`docs/CONTINUATION_PLAYBOOK.md`.

## 6) تنظیمات محیط

در `.env.local` (فقط local، commit نشود):
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL` (اختیاری)
- `GITHUB_TOKEN` یا `GH_TOKEN` (اختیاری برای وضعیت remote)
- `GITHUB_OWNER=asdeveloop`, `GITHUB_REPO=devatlas`

## 7) بررسی دسترسی ابزارهای رایگان در اینترنت فعلی

برای تصمیم‌گیری هوشمند قبل از هر مرحله:

```bash
pnpm agent:tools --json
```

این ابزار دسته‌بندی‌ها را بررسی می‌کند:
- `ci_cd`
- `code_quality`
- `automation`
- `local_dev_tools`
- `cloud_dev_platforms`
- `monitoring_logs`
- `infra_provisioning`
- `ai_tools`

تفسیر سریع:
- اینترنت/شبکه: اگر غیرقابل دسترس باشد، مسیر `--offline` بماند.
- بدون توکن GitHub: CI/CD و automation محلی فعال است، APIهای remote GitHub محدود می‌شوند.
- بدون `DEEPSEEK_API_KEY`: مسیر DeepSeek در `agent:auto` skip می‌شود.
- `agent:tools` به‌صورت خودکار برای شما دقیقاً نشان می‌دهد کدام بخش‌ها فعال/محدود است.

## 8) نقشه تصمیم برای 8 گروه ابزار رایگان

| گروه | تعریف | وضعیت پیش‌فرض فعلی | فرمان شروع |
| --- | --- | --- | --- |
| CI/CD | GitHub Actions + workflowها | partial (نیاز به token برای remote) | `pnpm agent:tools --json` |
| Code Quality | ESLint + TypeScript + Vitest + CodeQL + Dependency Review | full | `pnpm lint:api && pnpm lint:web` |
| Automation | اسکریپت‌های agent و inventory | full | `pnpm agent:smart --offline` |
| Local Dev Tools | node + pnpm + turbo | full | `pnpm doctor` |
| Cloud Dev Platforms | GitHub-hosted execution + docker runtime | partial | `pnpm agent:auto:offline` |
| Monitoring / Logs | health endpoints + ops alerts | partial | `pnpm ops:alerts -- --api http://127.0.0.1:3001 --json` |
| Infra provisioning | استیجینگ VPS + rollout | limited | `pnpm staging:readiness -- --skip-data-rehearsal --api http://127.0.0.1:3001` |
| AI tools | DeepSeek review | محدود (کلید فعلاً با هزینه محدود/فقط‌درصورتی‌که اعتبار داشته باشد) | `pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD` |

در عمل:
- اگر `recommended_mode: offline` بود: فقط دستورات local-first و lightweight را اجرا کن.
- اگر `recommended_mode: online` بود: قبل از PR یک run شامل smoke و (در صورت دسترس بودن token) deepseek اضافه کن.

## 9) بررسی VPS و عملیات خارج از ریپو

برای readiness واقعی زیرساخت:

```bash
pnpm agent:vps --json
```

اسکریپت `agent:vps` این موارد را می‌سنجد:
- پیکربندی `.env.vps`/`.env.local` (VPS/VPSNAME/DEPLOYUSER/PORT)
- موجودی ابزارهای محلی (`ssh`, `docker`, `psql`)
- دسترس‌پذیری SSH و اجرای remote check (در صورت وجود key)
- وجود اسکریپت deploy روی VPS

کارهایی که باید خارج از ریپو انجام شوند (در صورت نیاز):
1) GitHub
   - `GITHUB_TOKEN`/`GH_TOKEN` را با scope minimum برای دسترسی workflow تنظیم کن.
2) DeepSeek
   - `DEEPSEEK_API_KEY` معتبر و دارای quota فعال.
3) VPS
   - کلید SSH را روی VPS نصب کن (`~/.ssh/authorized_keys`)
   - اگر auth password-based لازم است، بهتر است روی key-based مهاجرت شود.
   - تایید مسیر استیجینگ: `/var/www/devatlas/shared/scripts/deploy-staging.sh` و env shared
4) DNS/شبکه
   - اگر `VPSNAME` دارید، DNS را resolve و firewall را برای SSH/HTTP باز بررسی کن.
