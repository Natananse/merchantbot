const { session } = require("../states/session");
const { sendMainMenu, HTML } = require("../utils/telegramUI");
const { escapeHtml } = require("../utils/formatters");

function welcomeText(user) {
  return (
    `<b>🛍 Welcome to Marketplace, ${escapeHtml(user.firstName)}!</b>\n\n` +
    `Buy and sell products directly through this Telegram bot.\n\n` +
    `• <b>Buy</b> — browse products, add to cart and order.\n` +
    `• <b>Sell</b> — register your shop and publish your products.\n\n` +
    `Use the buttons below to get started. 👇`
  );
}

async function startCommand(ctx) {
  session.clear(ctx.user.id);
  await sendMainMenu(ctx, welcomeText(ctx.user));
}

async function menuCommand(ctx) {
  await sendMainMenu(ctx);
}

async function helpCommand(ctx) {
  await ctx.reply(
    `📖 <b>Marketplace Help</b>\n\n` +
      `/start — open the main menu\n` +
      `/menu — main menu\n` +
      `/cancel — cancel the current action\n` +
      `/help — this help\n\n` +
      `Use the menu buttons to browse products, search, manage your cart and orders.\n` +
      `Sellers can register via "Become a Seller" and manage products from the Seller Dashboard.`,
    HTML
  );
}

async function cancelCommand(ctx) {
  session.clear(ctx.user.id);
  await ctx.reply("❌ Cancelled. Nothing was changed.", HTML);
  await sendMainMenu(ctx);
}

// Called for any unexpected plain text while no flow is active.
async function idleFallback(ctx) {
  await ctx.reply(
    "I don't understand that text. Use the buttons, or press /menu to return to the main menu.",
    HTML
  );
}

module.exports = {
  startCommand,
  menuCommand,
  helpCommand,
  cancelCommand,
  idleFallback,
  welcomeText,
};