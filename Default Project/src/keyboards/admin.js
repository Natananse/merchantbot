const { Markup } = require("telegraf");
const k = require("./main");

function applicationReviewKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("✅ Submit", "app_submit")],
    [k.btn("❌ Cancel", "cancel")],
  ]);
}

function checkoutSummaryKeyboard(cancelData = "cancel") {
  return Markup.inlineKeyboard([
    [k.btn("✅ Confirm Order", "confirmck")],
    [k.btn("❌ Cancel", cancelData)],
  ]);
}

// Admin panel --------------------------------------------------------------

function adminPanelKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("👥 Users", "adusers:0")],
    [
      k.btn("🏪 Seller Applications", "adapps:0"),
      k.btn("📦 Pending Products", "adpends:0"),
    ],
    [k.btn("📦 All Products", "adprod:0")],
    [k.btn("📋 Orders", "adords:0")],
    [k.btn("📂 Categories", "adcats")],
    [k.btn("🏪 Sellers", "adsellers:0")],
    [k.btn("📊 Statistics", "adstats")],
    [k.btn("🏠 Main Menu", "menu")],
  ]);
}

function adminApplicationsKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adapps:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `adapps:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "admin")]]);
}

function adminPendingProductsKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adpends:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `adpends:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "admin")]]);
}

function adminProductsKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adprod:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `adprod:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "admin")]]);
}

function adminOrdersKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adords:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `adords:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "admin")]]);
}

function adminSellersKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adsellers:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `adsellers:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "admin")]]);
}

function adminCategoriesKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("➕ Add Category", "catadd")],
    [k.btn("⬅️ Back", "admin")],
  ]);
}

function adminOrderViewKeyboard(orderId, canCancel) {
  const rows = [];
  if (canCancel) rows.push([k.btn("❌ Cancel Order", `adocancel:${orderId}`)]);
  rows.push([k.btn("⬅️ Back", "adords:0")]);
  return Markup.inlineKeyboard(rows);
}

module.exports = {
  applicationReviewKeyboard,
  checkoutSummaryKeyboard,
  adminPanelKeyboard,
  adminApplicationsKeyboard,
  adminPendingProductsKeyboard,
  adminProductsKeyboard,
  adminOrdersKeyboard,
  adminSellersKeyboard,
  adminCategoriesKeyboard,
  adminOrderViewKeyboard,
};