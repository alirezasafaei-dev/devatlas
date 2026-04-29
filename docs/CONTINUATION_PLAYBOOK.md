# Playbook for Continuation Without Manual Handoff

این فایل برای وضعیت «تو در چرخه نیستی، ولی توسعه باید جلو برود» نوشته شده است.

## هدف

- پیشروی roadmap بدون توقف دستی
- استفادهٔ حداکثری از ابزارهای رایگان موجود + هوش مصنوعی محلی
- ثبت artifact برای اینکه مسیر تصمیم‌گیری قابل review بماند

## فازهای شروع هر جلسه

1. وضعیت اولیه محیط
   - `pnpm doctor`
   - `pnpm agent:preflight --json`
2. تعیین مسیر
   - اگر `recommendedMode=offline` بود: `pnpm agent:auto:offline`
   - در غیر این‌صورت: `pnpm agent:auto --deepseek --deepseek-diff HEAD~1..HEAD`
   - برای کم‌توکن: `AGENT_LOW_TOKEN_MODE=1 pnpm agent:preflight --json && pnpm agent:auto:lean`
3. جمع‌بندی عملیات جلسه
   - `pnpm agent:autopilot > tmp/agent-autopilot-$(date +%F).log`
   - اگر تغییرات API/DB/Web contract انجام شد: runbook مربوطه را آپدیت کنید
4. تصمیم برای roadmap
   - `docs/ROADMAP.md` را در بخش همان آیتم با `InProgress`, `Blocked`, `Done` به‌روزرسانی کنید.

## بررسی ابزارهای رایگان (اولویت پایین‌ترین هزینه)

- `pnpm agent:tools --json` → صحت اینترنت/توکن/توابع local را بررسی می‌کند.
- `pnpm agent:deepseek:local --file <file> --json` یا `pnpm agent:deepseek:local --diff HEAD~1..HEAD --json` → بازبینی منطقی رایگان روی کد/تغییرات.
- اگر اینترنت و توکن موجود است: `pnpm agent:deepseek --file ...` یا `pnpm agent:deepseek --diff ...` جایگزین را اجرا کنید.

## قواعد «No Silent Compact»

- قبل از پایان هر تغییر بزرگ، حداقل یکی از این‌ها باید قابل تولید باشد:
  - output یک ابزار اتوماسیون (agent/report)
  - نتیجه `verify`/`test`/`typecheck` روی scope تغییر داده
  - خروجی smoke/health برای جریان release
- هیچ تصمیمی بدون اثر در `tmp/agent-*` یا `artifacts/agent-*` نگذار.

## مسیر توسعه بعدی

- اگر مسیر roadmap بسته شد: `docs/ROADMAP.md` و `CHANGELOG.md` را با یک خط کوتاه همراه تاریخ بروز کن.
- برای هر merge یا تغییر فاز، ترتیب اجرای کمینه را حفظ کن:
  - `pnpm lint:<scope>`
  - `pnpm typecheck:<scope>`
  - `pnpm test:<scope>`
  - برای مسیر استیجینگ: `pnpm staging:readiness -- --skip-data-rehearsal`
