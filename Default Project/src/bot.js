const { Telegraf } = require("telegraf");
const { env } = require("./config/env");
const { attachUser } = require("./middleware/auth");
const notificationService = require("./services/notificationService");
const { register } = require("./handlers");
const { logError } = require("./utils/logger");

function createBot() {
  if (!env.BOT_TOKEN || env.BOT_TOKEN === "REPLACE_WITH_YOUR_BOT_TOKEN") {
    throw new Error(
      "BOT_TOKEN is not set. Copy .env.example to .env and put your BotFather token there."
    );
  }
  const bot = new Telegraf(env.BOT_TOKEN);

  // Create/find the user once per update and attach to ctx.
  bot.use(attachUser);

  // Central notification channel.
  notificationService.setBot(bot);

  // Wire all commands + buttons + text router.
  register(bot);

  // Global safety net — the bot never silently crashes.
  bot.catch((err, ctx) => {
    logError("BOT_CATCH", {
      message: err.message,
      update: ctx.update?.update_id,
      stack: err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : "",
    });
    if (ctx && ctx.reply) {
      ctx.reply("⚠️ Something went wrong. Please try again.").catch(() => {});
    }
  });

  return bot;
}

module.exports = { createBot, env };