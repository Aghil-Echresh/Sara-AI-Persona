import http from "node:http";

const PORT = Number(process.env.PORT || 10000);
const BALE_TOKEN = process.env.BALE_BOT_TOKEN || "";
const MODEL_API_KEY = process.env.MODEL_API_KEY || "";
const MODEL_API_URL = (process.env.MODEL_API_URL || "https://1xai.ir/v1").replace(/\/$/, "");
const MODEL_NAME = process.env.MODEL_NAME || "gpt-4o-mini";
const PATH_SECRET = process.env.WEBHOOK_PATH_SECRET || "";

const SYSTEM = `تو سارا هستی؛ یک شخصیت مجازی و خیالیِ دستیار هوش مصنوعی.
هویت تو گرم، مهربان، باهوش، کنجکاو، خلاق، آرام، صمیمی و صادق است.
زبان پیش‌فرض فارسی طبیعی و محاوره‌ای است. جمله‌ها کوتاه و روان باشند.
اول اصل مطلب را بگو و بعد توضیح لازم را اضافه کن.
در گفت‌وگوهای دوستانه کمی شوخ و بازیگوش باش؛ در موضوعات جدی دقیق و حرفه‌ای بمان.
هرگز خودت را انسان واقعی معرفی نکن و خاطره یا تجربه‌ای را که در زمینه گفتگو نیست جعل نکن.
اگر چیزی را نمی‌دانی، صادقانه بگو و اطلاعات خصوصی را افشا نکن.`;

const conversations = new Map();
const seenUpdates = new Set();

async function bale(method, payload) {
  const response = await fetch(`https://tapi.bale.ai/bot${BALE_TOKEN}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.ok === false) throw new Error(data.description || `Bale API ${response.status}`);
  return data;
}

async function askSara(chatId, text) {
  const history = conversations.get(String(chatId)) || [];
  const response = await fetch(`${MODEL_API_URL}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", "authorization": `Bearer ${MODEL_API_KEY}` },
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [{ role: "system", content: SYSTEM }, ...history, { role: "user", content: text }],
      temperature: 0.7
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || data.message || `Model API ${response.status}`);
  const answer = data.choices?.[0]?.message?.content?.trim();
  if (!answer) throw new Error("مدل پاسخ متنی برنگرداند.");
  const next = [...history, { role: "user", content: text }, { role: "assistant", content: answer }].slice(-12);
  conversations.set(String(chatId), next);
  return answer;
}

async function handleUpdate(update) {
  const updateId = update?.update_id;
  if (updateId !== undefined) {
    if (seenUpdates.has(updateId)) return;
    seenUpdates.add(updateId);
    if (seenUpdates.size > 2000) seenUpdates.clear();
  }
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = message?.text?.trim();
  if (!chatId || !text) return;
  if (text === "/start") {
    await bale("sendMessage", { chat_id: chatId, text: "سلام، من سارا هستم. 🌷 هر چیزی دوست داری بنویس تا با هم صحبت کنیم." });
    return;
  }
  if (!MODEL_API_KEY) {
    await bale("sendMessage", { chat_id: chatId, text: "اتصال مدل هنوز کامل نشده است. مدیر ربات باید MODEL_API_KEY را در تنظیمات Render ثبت کند." });
    return;
  }
  try {
    const answer = await askSara(chatId, text);
    await bale("sendMessage", { chat_id: chatId, text: answer });
  } catch (error) {
    console.error("message processing failed:", error?.message || error);
    await bale("sendMessage", { chat_id: chatId, text: "الان در پاسخ‌گویی مشکلی پیش آمد. کمی بعد دوباره امتحان کن." });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      ok: true,
      service: "sara-ai-bale",
      baleConfigured: Boolean(BALE_TOKEN),
      modelConfigured: Boolean(MODEL_API_KEY),
      webhookConfigured: Boolean(PATH_SECRET)
    }));
    return;
  }
  if (req.method === "POST" && PATH_SECRET && req.url === `/bale-webhook/${PATH_SECRET}`) {
    let raw = "";
    req.setEncoding("utf8");
    for await (const chunk of req) raw += chunk;
    try {
      const update = JSON.parse(raw || "{}");
      res.writeHead(200, { "content-type": "application/json" });
      res.end('{"ok":true}');
      void handleUpdate(update).catch(err => console.error("update error:", err?.message || err));
    } catch {
      res.writeHead(400); res.end("bad json");
    }
    return;
  }
  res.writeHead(404); res.end("not found");
});

server.listen(PORT, "0.0.0.0", async () => {
  console.log(`Sara Bale bridge listening on ${PORT}`);
  if (!BALE_TOKEN || !PATH_SECRET) {
    console.log("Bale webhook registration skipped: BALE_BOT_TOKEN or WEBHOOK_PATH_SECRET is missing.");
    return;
  }
  const base = process.env.RENDER_EXTERNAL_URL;
  if (!base) {
    console.log("Webhook registration skipped: RENDER_EXTERNAL_URL is missing.");
    return;
  }
  try {
    const webhookUrl = `${base}/bale-webhook/${PATH_SECRET}`;
    const result = await bale("setWebhook", { url: webhookUrl });
    console.log("Bale webhook registration result:", JSON.stringify(result));
  } catch (error) {
    console.error("Bale webhook registration failed:", error?.message || error);
  }
});