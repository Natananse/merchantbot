// Utility to switch the Telegram webhook to a given public domain.
//
// Usage:
//   node scripts/set-webhook.js https://your-ngrok-domain.ngrok-free.app
//
// This is handy when you started ngrok AFTER the bot was already running.
require("dotenv").config();
const { Telegraf } = require("telegraf");
const { env } = require("../src/config/env");

async function main() {
  const domain = (process.argv[2] || env.WEBHOOK_DOMAIN || "").replace(/\/+$/, "");
  if (!domain) {
    console.error(
      "Usage: node scripts/set-webhook.js https://your-domain.ngrok-free.app"
    );
    process.exit(1);
  }
  const bot = new Telegraf(env.BOT_TOKEN);
  await bot.telegram.setWebhook(`${domain}/webhook`);
  const info = await bot.telegram.getWebhookInfo();
  console.log("✅ Webhook configured:");
  console.log(JSON.stringify(info, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error("Failed to set webhook:", err.message);
  process.exit(1);
});