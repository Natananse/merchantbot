const startCtl = require("./start");
const router = require("./router");
const { handleText, handlePhoto, handleContact } = require("./text");

function register(bot) {
  // Bot commands -----------------------------------------------------------
  bot.start(startCtl.startCommand);
  bot.command("menu", startCtl.menuCommand);
  bot.command("help", startCtl.helpCommand);
  bot.command("cancel", startCtl.cancelCommand);

  // Inline button actions (every button the bot generates) ----------------
  router.registerActions(bot);

  // Plain-text messages — text-step routing handles the active state,
  // everything else falls back to idle.
  bot.on("text", handleText);

  // Photos sent during product creation / editing.
  bot.on("photo", handlePhoto);

  // Contacts sent via the "Send Phone" button in checkout.
  bot.on("contact", handleContact);
}

module.exports = { register };