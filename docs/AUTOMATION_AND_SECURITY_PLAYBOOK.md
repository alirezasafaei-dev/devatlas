# Playbook: GitHub + Automation + DeepSeek Integration

این فایل مسیر اجرایی برای مدیریت قابلیت‌های رایگان GitHub، اتوماسیون سریع و ابزارهای توسعه است.

## هدف
- سرعت‌ بخشیدن به توسعه روزمره
- حفظ امنیت و کیفیت قبل از merge
- مدیریت متمرکز قابلیت‌های اتوماسیون (GitHub Actions/Dependabot/CodeQL)
- استفاده از DeepSeek برای بازبینی هوشمند تغییرات

## پیش‌نیازها
- `pnpm` 10.33+ و `node` 20+
- `python3` 3.11+
- دسترسی اینترنت برای اجرای remote actions
- نگهداری secretها در `.env.local` (در repository commit نشود)

## فایل‌های کلیدی
- `package.json` scripts:
  - `agent:github`
  - `agent:deepseek`
  - `agent:inventory`
  - `agent:ops`
  - `agent:smart`
  - `agent:auto`
  - `agent:auto:offline`
  - `doctor`
  - `agent:verify`
  - `ingest:smoke`
- اسکریپت‌ها:
  - `scripts/github-hub.mjs`
  - `scripts/github-inventory.py`
  - `scripts/deepseek-review.py`
  - `scripts/doctor.mjs`
  - `scripts/agent-verify.mjs`
- Workflowها:
  - `.github/workflows/ci.yml`
  - `.github/workflows/codeql.yml`
  - `.github/workflows/dependency-review.yml`
  - `.github/workflows/github-ops.yml`
  - `.github/dependabot.yml`

## ترتیب اجرای اولویت‌دار (Roadmap-aligned)
1. **Baseline محلی**
   - اجرای خودکار وضعیت: `pnpm agent:preflight --json`
   - `pnpm doctor`
   - یا اجرای یکجا: `pnpm agent:ops --skip-verify --skip-github`
   - `pnpm agent:github status --json`
   - `pnpm agent:inventory`
2. **حفظ کیفیت کد**
   - `pnpm lint:api`
   - `pnpm typecheck:api`
   - `pnpm test:api`
   - `pnpm lint:web`
   - `pnpm typecheck:web`
   - `pnpm test:web`
3. **اتوماسیون و امنیت پروژه**
   - Push to `main/develop`:
     - `ci.yml` اجرا می‌شود
     - Dependabot: مدیریت آپدیت‌ پکیج/Actions
     - Dependency Review: بررسی آسیب‌پذیری روی PR
     - CodeQL: اسکن security
   - `pnpm agent:github actions --json` برای بررسی وضعیت workflowها
4. **بازبینی هوشمند تغییرات**
   - قبل از PR یا بعد از تغییرات بزرگ:
   - `pnpm agent:deepseek --diff HEAD~1..HEAD --json` (اگر `DEEPSEEK_API_KEY` موجود باشد)
   - مسیر یک‌مرحله‌ای: `pnpm agent:ops --deepseek --deepseek-diff HEAD~1..HEAD --smoke`
   - برای اجرای خودکار و کم‌هزینه در هر مرحله:
   - `pnpm agent:auto --offline` (دسترسی اینترنت ندارد / offline)
   - `pnpm agent:auto --smoke --deepseek` (وقتی دسترسی کامل دارید)
5. **انبار مدیریت runbook و audit**
   - اجرای زمان‌بندی شده `github-ops.yml` روی `workflow_dispatch` یا cron
   - خروجی: artifact `github-ops-report`
   - اجرای پیش‌رویداد در PR: workflow `agent-ops-guard.yml` (بدون DeepSeek، با مسیر سریع lint/typecheck و inventory)

## فرمان‌های عملیاتی سریع
- وضعیت GitHub (بدون token):
  - `pnpm agent:github status`
- وضعیت کامل با token:
  - `GITHUB_TOKEN=... pnpm agent:github actions --json`
- اجرای کامل audit زمان‌بندی‌شده:
  - `pnpm agent:ops --skip-doctor --skip-verify --skip-deepseek --report tmp/agent-ops-report.json --json`
- اجرای سبک برای PR:
  - workflow `Agent Ops Guard` روی `pull_request` به `main`/`develop`
- آمار local agents:
  - `pnpm agent:github agents`
- گزارش کامل inventory:
  - `pnpm agent:inventory > tmp/automation-inventory.json`
- بررسی کد با DeepSeek:
  - `DEEPSEEK_API_KEY=... pnpm agent:deepseek --file apps/api/src/modules/ai/ai.service.ts`
  - `DEEPSEEK_API_KEY=... pnpm agent:ops --deepseek --deepseek-file apps/api/src/modules/ai/ai.service.ts`
  - `DEEPSEEK_API_KEY=... pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD`

برای مسیر اجرایی روزمره، نگاه دقیق‌تری به `docs/AGENT_GUIDE.md` داشته باشید (حالت‌های offline/online + ترتیب اولویت gates + مدیریت توکن خروجی).

### عملیات VPS قبل از deploy

- قبل از هر عملیات استیجینگ، `pnpm agent:vps --json` را اجرا کنید.
- اگر `canRunDeploy=false` بود، ابتدا کارهای خارج از ریپو را کامل کنید: SSH key, host/firewall, deploy script وجود دارد، staging env آماده است.

## مدیریت متغیرهای محیطی
- در `.env.local` (نمونه‌ای که باید نگه‌داری شود):
  - `DEEPSEEK_API_KEY`
- `DEEPSEEK_MODEL` (پیش‌فرض `deepseek-chat`)
- `GITHUB_TOKEN` یا `GH_TOKEN`
- `GITHUB_OWNER=asdeveloop`
- `GITHUB_REPO=devatlas`

> نکته: چون `.env.local` در `.gitignore` است، tokenها بعد از clone از دست نخواهند رفت.

### بررسی سریع قابلیت‌ها (اولویت استفاده)

- `pnpm agent:tools --json` خروجی قابل اتکا برای این می‌دهد که در اینترنت/توکن فعلی کدام گروه‌ها واقعیاً قابل استفاده‌اند:
  - `CI/CD`
  - `Code Quality`
  - `Automation`
  - `Local Dev Tools`
  - `Cloud Dev Platforms`
  - `Monitoring / Logs`
  - `Infra provisioning`
  - `AI tools`

## نگهداری و به‌روزرسانی
- برای هر تغییر major در اسکریپت‌ها:
  1) `pnpm doctor`
  2) `pnpm lint:api && pnpm typecheck:api && pnpm test:api`
  3) `pnpm lint:web && pnpm typecheck:web && pnpm test:web`
  4) ثبت نتیجه در `docs/ROADMAP.md` و لاگ اجرای task
