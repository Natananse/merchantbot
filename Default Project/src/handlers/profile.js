const { Markup } = require("telegraf");
const { session } = require("../states/session");
const k = require("../keyboards/main");
const userService = require("../services/userService");
const orderService = require("../services/orderService");
const { escapeHtml } = require("../utils/formatters");
const { editOrSend } = require("../utils/telegramUI");

async function showProfile(ctx) {
  const user = await userService.getUserById(ctx.user.id);
  if (!user) {
    await ctx.reply("Start the bot with /start first.");
    return;
  }
  const { total } = await orderService.listBuyerOrders(user.id, { page: 0, perPage: 1 });
  const roleLabel = user.role === "ADMIN" ? "Admin" : user.sellerProfile ? "Seller" : "Buyer";
  const text =
    `<b>👤 Profile</b>\n\n` +
    `Name: ${escapeHtml(user.firstName)} ${escapeHtml(user.lastName || "")}`.trimEnd() +
    `\nUsername: ${user.username ? "@" + escapeHtml(user.username) : "-"}` +
    `\nPhone: ${escapeHtml(user.phone || "-")}` +
    `\nLocation: ${escapeHtml(user.location || "-")}` +
    `\nAccount type: <b>${roleLabel}</b>` +
    `\nOrders: ${total}` +
    `\nJoined: ${user.createdAt.toISOString().slice(0, 10)}`;
  await editOrSend(
    ctx,
    text,
    Markup.inlineKeyboard([
      [k.btn("📱 Update Phone", "pfup_phone"), k.btn("📍 Update Location", "pfup_loc")],
      [k.btn("🏠 Main Menu", "menu")],
    ])
  );
}

async function startUpdatePhone(ctx) {
  session.set(ctx.user.id, { step: "EDIT_PHONE" });
  await ctx.reply(
    "Send your new phone number (digits only, optional +). E.g. +251912345678\n(/cancel to abort)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function startUpdateLocation(ctx) {
  session.set(ctx.user.id, { step: "EDIT_LOCATION" });
  await ctx.reply(
    "Send your new delivery location/address as text.\n(/cancel to abort)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function savePhone(ctx, phone) {
  await userService.updateUser(ctx.user.id, { phone });
  session.clear(ctx.user.id);
  await ctx.reply("✅ Phone number updated.");
  await showProfile(ctx);
}

async function saveLocation(ctx, location) {
  await userService.updateUser(ctx.user.id, { location });
  session.clear(ctx.user.id);
  await ctx.reply("✅ Location updated.");
  await showProfile(ctx);
}

module.exports = {
  showProfile,
  startUpdatePhone,
  startUpdateLocation,
  savePhone,
  saveLocation,
};