const { Markup } = require("telegraf");

// Shared helpers ------------------------------------------------------------

function row(...buttons) {
  return buttons.filter(Boolean);
}

function btn(text, data) {
  return Markup.button.callback(text, data);
}

function urlBtn(text, url) {
  return Markup.button.url(text, url);
}

// Returns the PLAIN keyboard object ({ inline_keyboard }) — NOT a Markup
// instance. Passing a Markup instance under `reply_markup` would serialize to
// a nested `{ reply_markup: { reply_markup: ... } }` shape that the Telegram
// API rejects, so callers always set `reply_markup: keyboard(rows)`.
function keyboard(rows) {
  return { inline_keyboard: rows.filter((r) => r.length > 0) };
}

const BACK = btn("⬅️ Back", "browse");
const MAIN = btn("🏠 Main Menu", "menu");
const CANCEL = btn("❌ Cancel", "cancel");

// ---------------------------------------------------------------------------
// Main menu
// ---------------------------------------------------------------------------

function mainMenu({ isSeller = false, isAdmin = false } = {}) {
  const rows = [
    row(btn("🛒 Browse Products", "browse")),
    row(btn("🔎 Search", "search"), btn("📂 Categories", "cats")),
    row(btn("🛍 My Cart", "cart"), btn("📦 My Orders", "orders")),
    row(btn("👤 My Profile", "profile")),
  ];
  if (isSeller) rows.push(row(btn("🏪 Seller Dashboard", "sdash")));
  else rows.push(row(btn("🏪 Become a Seller", "regs")));
  if (isAdmin) rows.push(row(btn("⚙️ Admin Panel", "admin")));
  rows.push(row(MAIN));
  return keyboard(rows);
}

// ---------------------------------------------------------------------------
// Common
// ---------------------------------------------------------------------------

function productListButtons({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(btn("⬅️ Previous", `browse:${page - 1}`));
  nav.push(btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(btn("Next ➡️", `browse:${page + 1}`));
  return nav;
}

module.exports = {
  row,
  btn,
  urlBtn,
  keyboard,
  BACK,
  MAIN,
  CANCEL,
  mainMenu,
  productListButtons,
};