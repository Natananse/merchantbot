const { Markup } = require("telegraf");
const { session } = require("../states/session");
const skb = require("../keyboards/seller");
const kb = require("../keyboards/admin");
const k = require("../keyboards/main");
const sellerService = require("../services/sellerService");
const sellerApplicationService = require("../services/sellerApplicationService");
const notificationService = require("../services/notificationService");
const { formatNumber, escapeHtml } = require("../utils/formatters");
const { editOrSend } = require("../utils/telegramUI");

// ── Registration flow entry ────────────────────────────────────────────────

async function becomeSeller(ctx) {
  const user = ctx.user;
  if (user.sellerProfile && user.sellerProfile.approved) {
    await ctx.reply("You are already a seller! Opening your dashboard...");
    await dashboard(ctx);
    return;
  }
  const existing = await sellerApplicationService.getApplicationByUser(user.id);
  if (existing && existing.status === "PENDING") {
    await ctx.reply(
      "⏳ You already have a pending seller application.\nPlease wait for the admin to review it.",
      k.keyboard([[k.btn("🏠 Main Menu", "menu")]])
    );
    return;
  }
  session.set(user.id, { step: "REG_NAME", application: {} });
  await ctx.reply(
    "<b>🏪 Become a Seller</b>\n\nStep 1 of 4 — <b>Shop name</b>\nSend the name you want for your shop. (/cancel to abort)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function appSubmit(ctx) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "REG_REVIEW") {
    await ctx.reply("Restart the seller registration.");
    return;
  }
  const app = st.application;
  const created = await sellerApplicationService.createApplication({
    userId: ctx.user.id,
    shopName: app.shopName,
    description: app.description || null,
    phone: app.phone || null,
    location: app.location || null,
  });
  session.clear(ctx.user.id);
  await ctx.reply(
    `<b>✅ Application submitted!</b>\n\nYour shop "<b>${escapeHtml(app.shopName)}</b>" is now ` +
      `under review. You'll be notified once the admin approves it.`,
    k.keyboard([[k.btn("🏠 Main Menu", "menu")]])
  );
  await notificationService.notifyAdmin(
    `<b>🆕 New seller application</b>\n\n` +
      `Shop: <b>${escapeHtml(app.shopName)}</b>\n` +
      `Applicant: ${escapeHtml(ctx.user.firstName)} ${escapeHtml(ctx.user.lastName || "")}\n` +
      `Phone: ${escapeHtml(app.phone || "-")}\n` +
      `Location: ${escapeHtml(app.location || "-")}\n\n` +
      `Open the Admin Panel → Seller Applications to review.`
  );
}

// ── Seller dashboard ───────────────────────────────────────────────────────

async function dashboard(ctx) {
  if (!ctx.seller) {
    await ctx.reply("Approved seller account required.", k.keyboard([[k.btn("🏠 Main Menu", "menu")]]));
    return;
  }
  const stats = await sellerService.getSellerStats(ctx.seller.id);
  const { env } = require("../config/env");
  const text =
    `<b>🏪 SELLER DASHBOARD</b>\n\n` +
    `Shop: <b>${escapeHtml(ctx.seller.shopName)}</b>\n` +
    `Products: ${stats.totalProducts} (${stats.approvedProducts} live)\n` +
    `Orders: ${stats.orders} (${stats.pendingOrders} pending)\n` +
    `Revenue: <b>${formatNumber(stats.revenue)} ${env.CURRENCY}</b>\n\n` +
    `Choose an option below:`;
  await editOrSend(ctx, text, skb.sellerDashboardKeyboard().reply_markup);
}

async function sellerStats(ctx) {
  const stats = await sellerService.getSellerStats(ctx.seller.id);
  await ctx.reply(
    `<b>📊 Statistics</b>\n\n` +
      `Total products: ${stats.totalProducts}\n` +
      `Approved products: ${stats.approvedProducts}\n` +
      `Total orders: ${stats.orders}\n` +
      `Pending orders: ${stats.pendingOrders}\n` +
      `Revenue (excl. cancelled): <b>${formatNumber(stats.revenue)}</b>`,
    k.keyboard([[k.btn("⬅️ Back", "sdash")]])
  );
}

async function shopProfile(ctx) {
  const shopView = await sellerService.getShopView(ctx.seller.id);
  const { shopCardText } = require("../utils/render");
  await ctx.reply(
    shopCardText(shopView),
    k.keyboard([
      [k.btn("🧰 Edit Shop", "sedit")],
      [k.btn("⬅️ Back", "sdash")],
    ])
  );
}

// ── Shop editing (session-driven) ──────────────────────────────────────────

async function startEditShop(ctx) {
  await ctx.reply("What would you like to change?", skb.shopEditKeyboard().reply_markup);
}

async function editField(ctx, field) {
  const labels = {
    shopName: "Shop name",
    description: "Shop description",
    phone: "Shop phone",
    location: "Shop location",
  };
  session.set(ctx.user.id, { step: "EDIT_SHOP", field });
  await ctx.reply(`Send the new <b>${labels[field]}</b>. (/cancel to abort)`, k.keyboard([[k.btn("❌ Cancel", "cancel")]]));
}

async function saveShopField(ctx, value) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "EDIT_SHOP") return;
  await sellerService.updateShop(ctx.user.id, { [st.field]: value });
  session.clear(ctx.user.id);
  await ctx.reply("✅ Shop updated.");
  await shopProfile(ctx);
}

module.exports = {
  becomeSeller,
  appSubmit,
  dashboard,
  sellerStats,
  shopProfile,
  startEditShop,
  editField,
  saveShopField,
};