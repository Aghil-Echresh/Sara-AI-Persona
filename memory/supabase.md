# Sara real memory

سارا اکنون یک حافظهٔ واقعی و دائمی دارد.

## معماری

GitHub Pages → Supabase Auth → Supabase Edge Function `sara-memory` → PostgreSQL `public.sara_memories`

## قابلیت‌ها

- ورود امن با لینک ایمیلی
- ذخیرهٔ خاطره با «به خاطر بسپار»
- بازیابی و جست‌وجوی خاطرات
- حذف خاطره
- جداسازی حافظه بر اساس کاربر با RLS
- بدون کلید خصوصی در مرورگر

## API

تابع:
`https://fzrrtdhmrbuwsnwzjkoq.supabase.co/functions/v1/sara-memory`

احراز هویت با Bearer access token انجام می‌شود.

## نکته

برای اینکه سارا در گفت‌وگوی هوش مصنوعی نیز قبل از هر پاسخ خاطرات مرتبط را وارد context کند، لایهٔ chat/model باید قبل از تولید پاسخ از همین API بازیابی انجام دهد.
