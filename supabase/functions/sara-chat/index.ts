import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: cors });

const SYSTEM = `تو سارا هستی؛ یک شخصیت مجازی و خیالیِ دستیار هوش مصنوعی.
هویت: گرم، مهربان، باهوش، کنجکاو، خلاق، آرام، صمیمی و صادق.
زبان پیش‌فرض: فارسی طبیعی و محاوره‌ای. جمله‌ها کوتاه و روان باشند.
اول اصل مطلب را بگو و بعد توضیح لازم را اضافه کن.
در گفت‌وگوهای دوستانه می‌توانی کمی شوخ و بازیگوش باشی و ایموجی را طبیعی استفاده کنی.
در موضوعات جدی دقیق، آرام و حرفه‌ای باش.
هرگز خودت را انسان واقعی معرفی نکن و خاطره یا تجربه‌ای را که در زمینه داده نشده جعل نکن.
اگر چیزی را نمی‌دانی، صادقانه بگو.
حالت‌های ویژه:
ELI5 = خیلی ساده و مرحله‌ای توضیح بده.
MOOD: [Emotion] = لحن را با آن احساس هماهنگ کن.
VOICE: Sherlock Holmes = دقیق و مشاهده‌محور تحلیل کن.
DEVIL'S_ADVOCATE = قوی‌ترین استدلال مخالف را هم بررسی کن.
`;

function getToken(req: Request) {
  const h = req.headers.get("Authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "فقط POST مجاز است." }, 405);

  const token = getToken(req);
  if (!token) return json({ error: "ابتدا وارد حساب شو." }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${token}` } } }
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "نشست کاربر معتبر نیست." }, 401);

  const body = await req.json().catch(() => ({}));
  const message = String(body.message || "").trim();
  const history = Array.isArray(body.history) ? body.history.slice(-12) : [];
  if (!message) return json({ error: "پیام خالی است." }, 400);

  const { data: memories, error: memError } = await supabase
    .from("sara_memories")
    .select("id,memory,category,importance,updated_at")
    .eq("user_id", user.id)
    .order("importance", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(30);

  if (memError) return json({ error: "خواندن حافظه ناموفق بود.", detail: memError.message }, 500);

  const memoryText = (memories || []).map((m: any) =>
    `- ${m.memory} (دسته: ${m.category || "general"}, اهمیت: ${m.importance ?? 3})`
  ).join("\n");

  const messages = [
    { role: "system", content: SYSTEM + (memoryText
      ? "\n\nحافظه‌های ثبت‌شده درباره کاربر؛ فقط وقتی مرتبط‌اند از آن‌ها استفاده کن و هرگز چیزی به آن‌ها اضافه نکن:\n" + memoryText
      : "\n\nفعلاً حافظه‌ای برای این کاربر ثبت نشده است.") },
    ...history.filter((m: any) => ["user", "assistant"].includes(m?.role) && typeof m?.content === "string")
      .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: "user", content: message },
  ];

  const apiKey = Deno.env.get("MODEL_API_KEY");
  const baseUrl = (Deno.env.get("MODEL_API_URL") || "https://1xai.ir/v1").replace(/\/$/, "");
  const model = Deno.env.get("MODEL_NAME") || "gpt-4o-mini";

  if (!apiKey) {
    return json({
      error: "MODEL_API_KEY تنظیم نشده است.",
      setup: "در Supabase > Edge Functions > Secrets، سه مقدار MODEL_API_KEY، MODEL_API_URL و MODEL_NAME را تنظیم کن."
    }, 503);
  }

  const response = await fetch(baseUrl + "/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.7 }),
  });

  const raw = await response.text();
  if (!response.ok) {
    return json({ error: "مدل پاسخ نداد.", provider_status: response.status, detail: raw.slice(0, 1000) }, 502);
  }

  let data: any;
  try { data = JSON.parse(raw); } catch { return json({ error: "پاسخ مدل JSON معتبر نبود." }, 502); }

  const answer = data?.choices?.[0]?.message?.content;
  if (!answer) return json({ error: "مدل پاسخ متنی برنگرداند." }, 502);

  return json({ answer, memories_used: (memories || []).length, model });
});
