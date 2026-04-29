# Session Log — Offline AI Automation (2026-04-29)

## اهداف انجام شده
- فعال‌سازی کامل مسیر AI آفلاین روی GPU + نگهداشتن سرویس‌ها با `systemd --user`.
- افزودن سرویس embedding به chain خودکار.
- تکمیل و به‌روزرسانی مستندات مربوط به سرویس‌های آفلاین.
- گزارش‌دادن وضعیت واقعی اجرا (status + smoke checks).

## تغییرات اعمال شده

### 1) اسکریپت نصب سرویس‌ها
- فایل: `scripts/install-offline-ai-services.sh`
- اضافه شد:
  - `devatlas-llama-embed.service`
  - وابستگی سرویس‌های health به: `ollama`, `chat`, `embed`
  - enable خودکار `devatlas-llama-embed.service`
  - تنظیم `git config core.hooksPath .githooks` برای نگهداشت githooks در سرویس نصب
  - review timer از `deepseek-review.py` مستقیم به `pnpm agent:devflow review --diff head` تغییر کرد تا خروجی استانداردتَر در `tmp/agent-devflow/review-latest.json` تولید شود.

### 2) اجرای خودکار نصب/فعالسازی
- دستور اجراشده: `bash scripts/install-offline-ai-services.sh`
- نتیجه:
  - `devatlas-ollama.service` فعال شد
  - `devatlas-llama-chat.service` فعال شد
  - `devatlas-llama-embed.service` فعال شد

### 3) اعتبارسنجی اجرا
- `systemctl --user status devatlas-llama-chat.service`
- `systemctl --user status devatlas-llama-embed.service`
- `pnpm agent:local:smoke` ✅
- `pnpm agent:local:smoke:embed` ✅
  - خروجی: `{"status":"ok","mode":"embed","dims":1024}`

### 4) مستندسازی
- `docs/OFFLINE_AI.md` به‌روزرسانی شد:
  - لیست سرویس‌ها شامل `devatlas-llama-embed.service`
  - بخش بررسی وضعیت سرویس‌ها شامل `status devatlas-llama-embed.service`
  - توضیح خروجی review به `tmp/agent-devflow/review-latest.json`.

## مراجع مهم خروجی و اثبات کار
- `scripts/install-offline-ai-services.sh`
- `docs/OFFLINE_AI.md`
- `tmp/agent-devflow/` (artifactهای review/context/pre-commit)

## وضعیت فعلی
- مسیر آفلاین/روی GPU از دید عملیاتی قابل ادامه‌دادن است و نیاز به تنظیم دستی جدید ندارد.
- فقط نیاز بعدی: تصمیم‌گیری در مورد حذف گلوگاه‌های ریسک مثل timeout در review یا خطاهای احتمالی `review failed` در برخی runs.

## نکته برای تداوم در جلسه بعد
- قبل از ادامه‌دادن کار، یکبار این دستور را اجرا کنید:
  - `pnpm agent:autopilot > tmp/agent-autopilot-$(date +%F).log`
