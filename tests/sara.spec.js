import { test, expect } from "@playwright/test";

const CHAT_URL = "https://fzrrtdhmrbuwsnwzjkoq.supabase.co/functions/v1/sara-chat";

async function preparePage(page, chatResponse) {
  // Replace the remote Supabase SDK with a deterministic test double.
  await page.route("https://esm.sh/@supabase/supabase-js@2", async route => {
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        export function createClient() {
          return {
            auth: {
              getSession: async () => ({ data: { session: null } }),
              signInAnonymously: async () => ({
                data: { session: { access_token: "test-access-token" } },
                error: null
              })
            }
          };
        }
      `
    });
  });

  await page.route(CHAT_URL, async route => {
    await route.fulfill({
      status: chatResponse.status,
      contentType: "application/json",
      body: JSON.stringify(chatResponse.body)
    });
  });

  await page.addInitScript(() => {
    window.speechSynthesis = {
      cancel() {},
      speak(utterance) {
        if (utterance.onstart) utterance.onstart();
        if (utterance.onend) utterance.onend();
      }
    };
    window.SpeechSynthesisUtterance = function (text) {
      this.text = text;
    };
  });

  await page.goto("/");
  await expect(page.locator("#status")).toContainText("سارا آماده است");
}

test("happy path: sends a valid message and renders the assistant answer", async ({ page }) => {
  await preparePage(page, {
    status: 200,
    body: { answer: "سلام! خوشحالم که با هم صحبت می‌کنیم." }
  });

  await page.locator("#message").fill("سلام سارا");
  await page.locator("#send").click();

  await expect(page.locator(".msg.user")).toContainText("سلام سارا");
  await expect(page.locator(".msg.assistant").last())
    .toContainText("سلام! خوشحالم که با هم صحبت می‌کنیم.");
  await expect(page.locator("#status")).toContainText("سارا آماده است");
  await expect(page.locator("#send")).toBeEnabled();
});

test("edge case: server returns an error and the UI reports it without getting stuck", async ({ page }) => {
  await preparePage(page, {
    status: 503,
    body: { error: "سرویس موقتاً در دسترس نیست" }
  });

  await page.locator("#message").fill("یک پیام آزمایشی");
  await page.locator("#send").click();

  await expect(page.locator(".msg.assistant").last())
    .toContainText("خطا: سرویس موقتاً در دسترس نیست");
  await expect(page.locator("#status")).toContainText("اتصال چت برقرار نیست");
  await expect(page.locator("#send")).toBeEnabled();
});
