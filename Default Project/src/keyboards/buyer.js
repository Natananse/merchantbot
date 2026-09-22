const { Markup } = require("telegraf");
const k = require("./main");

// ── Product browse / details ──────────────────────────────────────────────

function productViewKeyboard(product) {
  return Markup.inlineKeyboard([
    [
      k.btn("➕ Add to Cart", `add:${product.id}`),
      k.btn("🛒 Buy Now", `buynow:${product.id}`),
    ],
    [k.btn("🏪 View Seller", `sshop:${product.sellerId}`)],
    [k.btn("⬅️ Back", "browse")],
  ]);
}

// Used from category pages / search results so "Back" returns correctly.
function productViewKeyboardFrom(productId, sellerId, backData) {
  return Markup.inlineKeyboard([
    [
      k.btn("➕ Add to Cart", `add:${productId}`),
      k.btn("🛒 Buy Now", `buynow:${productId}`),
    ],
    [k.btn("🏪 View Seller", `sshop:${sellerId}`)],
    [k.btn("⬅️ Back", backData)],
  ]);
}

function paginateProducts({ page, pages, prefix }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Previous", `${prefix}:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `${prefix}:${page + 1}`));
  return nav;
}

function categoriesKeyboard(categories) {
  const rows = [];
  for (const cat of categories) {
    rows.push([k.btn(`${cat.emoji ? cat.emoji + " " : ""}${cat.name}`, `cat:${cat.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "browse")]);
  return Markup.inlineKeyboard(rows);
}

function categoryProductsKeyboard({ page, pages, categoryId }) {
  const nav = paginateProducts({ page, pages, prefix: `catp:${categoryId}` });
  const rows = [nav, [k.btn("⬅️ Back", "cats")]];
  return Markup.inlineKeyboard(rows);
}

// ── Cart ───────────────────────────────────────────────────────────────────

function cartItemKeyboard(cartItemId, productId) {
  return Markup.inlineKeyboard([
    [
      k.btn("➕", `cplus:${cartItemId}`),
      k.btn("➖", `cminus:${cartItemId}`),
      k.btn("❌", `crmv:${cartItemId}`),
    ],
  ]);
}

function cartFooterKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("🧹 Clear Cart", "cclear"), k.btn("✅ Checkout", "ck")],
    [k.btn("⬅️ Back", "menu")],
  ]);
}

function emptyCartKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("🛒 Browse Products", "browse")],
    [k.btn("🏠 Main Menu", "menu")],
  ]);
}

function checkoutStepsKeyboard() {
  return Markup.inlineKeyboard([
    [
      k.btn("📱 Send Phone", "ckreq"),
      k.btn("Skip", "ckskip_phone"),
    ],
    [k.btn("❌ Cancel", "cancel")],
  ]);
}

function checkoutConfirmKeyboard(cancelData = "cancel") {
  return Markup.inlineKeyboard([
    [k.btn("✅ Confirm Order", "confirmck")],
    [k.btn("❌ Cancel", cancelData)],
  ]);
}

// ── Orders (buyer) ─────────────────────────────────────────────────────────

function buyerOrdersPagination({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Previous", `orders:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `orders:${page + 1}`));
  return [nav, [k.btn("🏠 Main Menu", "menu")]];
}

function buyerOrderViewKeyboard(order) {
  const canCancel = order.status === "PENDING";
  const buttons = [];
  if (canCancel) buttons.push([k.btn("❌ Cancel Order", `bcancel:${order.id}`)]);
  buttons.push([k.btn("⬅️ Back to Orders", "orders")]);
  return Markup.inlineKeyboard(buttons);
}

module.exports = {
  productViewKeyboard,
  productViewKeyboardFrom,
  paginateProducts,
  categoriesKeyboard,
  categoryProductsKeyboard,
  cartItemKeyboard,
  cartFooterKeyboard,
  emptyCartKeyboard,
  checkoutStepsKeyboard,
  checkoutConfirmKeyboard,
  buyerOrdersPagination,
  buyerOrderViewKeyboard,
};