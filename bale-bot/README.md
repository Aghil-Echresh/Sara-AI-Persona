# Sara AI — Bale bridge

این سرویس پیام‌های متنی ربات بله را دریافت می‌کند و برای پاسخ‌گویی به مدل سازگار با OpenAI Chat Completions می‌فرستد.

## Render environment variables

- `BALE_BOT_TOKEN`: توکن ربات بله
- `MODEL_API_KEY`: کلید ارائه‌دهنده مدل
- `MODEL_API_URL`: پیش‌فرض `https://1xai.ir/v1`
- `MODEL_NAME`: پیش‌فرض `gpt-4o-mini`
- `WEBHOOK_PATH_SECRET`: رشته محرمانه برای مسیر وب‌هوک

بعد از ثبت متغیرها، Render را redeploy/restart کنید. سرویس با استفاده از `RENDER_EXTERNAL_URL` وب‌هوک را ثبت می‌کند.

## Health

`GET /health`

## Notes

- تاریخچه گفتگو فعلاً در حافظه فرایند نگهداری می‌شود و با restart/deploy پاک می‌شود.
- فقط پیام متنی پشتیبانی می‌شود.
- کلیدها را در GitHub قرار ندهید.
