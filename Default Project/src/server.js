const express = require("express");
const { env } = require("./config/env");
const { createBot } = require("./bot");
const { log, logError } = require("./utils/logger");

const WEBHOOK_PATH = "/webhook";

async function main() {
  if (!env.BOT_TOKEN || env.BOT_TOKEN === "REPLACE_WITH_YOUR_BOT_TOKEN") {
    console.error(
      "\n❌ BOT_TOKEN is not configured.\n" +
        "  1. Create your token with @BotFather\n" +
        "  2. Copy .env.example to .env\n" +
        "  3. Fill in BOT_TOKEN and ADMIN_TELEGRAM_ID\n" +
        "  4. Run: npm start\n"
    );
    process.exit(1);
  }

  const bot = createBot();
  const app = express();
  app.use(express.json());

  if (env.webhookMode) {
    // ---- Webhook mode (ngrok) ------------------------------------------
    const webhookUrl = `${env.WEBHOOK_DOMAIN}${WEBHOOK_PATH}`;
    app.post(WEBHOOK_PATH, bot.webhookCallback(WEBHOOK_PATH));
    app.get("/", (req, res) => res.json({ ok: true, mode: "webhook" }));

    await bot.telegram.setWebhook(webhookUrl).catch((err) => {
      logError("WEBHOOK_SET", { url: webhookUrl, error: err.message });
    });
    log("WEBHOOK", { url: webhookUrl });

    app.listen(env.PORT, () => {
      log("SERVER", { port: env.PORT, mode: "webhook" });
    });
  } else {
    // ---- Polling mode (easiest for development) --------------------------
    app.get("/", (req, res) => res.json({ ok: true, mode: "polling" }));
    app.listen(env.PORT, () => {
      log("SERVER", { port: env.PORT, mode: "polling" });
    });

    bot.launch().catch((err) => {
      logError("LAUNCH", { error: err.message });
      console.error("\n❌ Could not connect to Telegram. Is BOT_TOKEN correct?");
      process.exit(1);
    });
    log("BOT", { mode: "long-polling" });
  }

  // The bot always stops cleanly on Ctrl+C / SIGTERM.
  const shutdown = async () => {
    try {
      bot.stop("SIGTERM");
    } catch (_) {
      // not launched yet — fine
    }
    process.exit(0);
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

main().catch((err) => {
  logError("SERVER", { error: err.message, stack: err.stack });
  process.exit(1);
});