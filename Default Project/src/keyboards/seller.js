const { Markup } = require("telegraf");
const k = require("./main");

function sellerDashboardKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("➕ Add Product", "addp")],
    [k.btn("📦 My Products", "myp")],
    [
      k.btn("📝 Edit Product", "editp"),
      k.btn("🗑 Delete Product", "delp"),
    ],
    [k.btn("📋 Orders", "sorders")],
    [k.btn("🏪 Shop Profile", "sprofile")],
    [k.btn("📊 Statistics", "sstats")],
    [k.btn("🧰 Edit Shop", "sedit")],
    [k.btn("🏠 Main Menu", "menu")],
  ]);
}

function ownProductsKeyboard({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Previous", `myp:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `myp:${page + 1}`));
  return Markup.inlineKeyboard([nav, [k.btn("⬅️ Back", "sdash")]]);
}

function sellerProductCardKeyboard(productId, status) {
  return Markup.inlineKeyboard([
    [
      k.btn("📝 Edit", `editp:${productId}`),
      k.btn("🗑 Delete", `delp:${productId}`),
    ],
    [
      k.btn(status === "INACTIVE" ? "✅ Activate" : "😴 Deactivate", `tog:${productId}`),
    ],
    [k.btn("⬅️ Back", "myp")],
  ]);
}

function editProductKeyboard(productId) {
  return Markup.inlineKeyboard([
    [k.btn("🏷 Name", `fname:${productId}`)],
    [k.btn("📝 Description", `fdesc:${productId}`)],
    [k.btn("💰 Price", `fprice:${productId}`)],
    [k.btn("💱 Currency", `fcur:${productId}`)],
    [k.btn("📦 Stock", `fstock:${productId}`)],
    [k.btn("🖼 Image", `fimg:${productId}`)],
    [k.btn("📍 Location", `floc:${productId}`)],
    [k.btn("🚚 Delivery Info", `fdeliv:${productId}`)],
    [k.btn("🗑 Delete Product", `delp:${productId}`)],
    [k.btn("⬅️ Back", "myp")],
  ]);
}

function sellerOrdersPagination({ page, pages }) {
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Previous", `sorders:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${pages}`, "nop"));
  if (page < pages - 1) nav.push(k.btn("Next ➡️", `sorders:${page + 1}`));
  return [nav, [k.btn("⬅️ Back", "sdash")]];
}

// Valid next actions only — dead buttons are never rendered.
function sellerOrderActionsKeyboard(order, TRANSITIONS) {
  const allowed = TRANSITIONS[order.status] || [];
  const buttons = [];
  if (allowed.includes("CONFIRMED"))
    buttons.push(k.btn("✅ Confirm", `ost:${order.id}:CONF`));
  if (allowed.includes("PROCESSING"))
    buttons.push(k.btn("🔧 Processing", `ost:${order.id}:PROC`));
  if (allowed.includes("READY"))
    buttons.push(k.btn("📦 Ready", `ost:${order.id}:READY`));
  if (allowed.includes("DELIVERED"))
    buttons.push(k.btn("🚚 Delivered", `ost:${order.id}:DELV`));
  if (allowed.includes("CANCELLED"))
    buttons.push(k.btn("❌ Cancel", `ost:${order.id}:CANC`));

  const rows = buttons.length ? [buttons] : [];
  rows.push([k.btn("👁 View", `sordview:${order.id}`)]);
  rows.push([k.btn("⬅️ Back to Orders", "sorders")]);
  return Markup.inlineKeyboard(rows);
}

function sellerOrderViewKeyboard(order, TRANSITIONS) {
  const allowed = TRANSITIONS[order.status] || [];
  const buttons = [];
  if (allowed.includes("CONFIRMED"))
    buttons.push(k.btn("✅ Confirm", `ost:${order.id}:CONF`));
  if (allowed.includes("PROCESSING"))
    buttons.push(k.btn("🔧 Processing", `ost:${order.id}:PROC`));
  if (allowed.includes("READY"))
    buttons.push(k.btn("📦 Ready", `ost:${order.id}:READY`));
  if (allowed.includes("DELIVERED"))
    buttons.push(k.btn("🚚 Delivered", `ost:${order.id}:DELV`));
  if (allowed.includes("CANCELLED"))
    buttons.push(k.btn("❌ Cancel", `ost:${order.id}:CANC`));
  const rows = buttons.length ? [buttons] : [];
  rows.push([k.btn("⬅️ Back to Orders", "sorders")]);
  return Markup.inlineKeyboard(rows);
}

function confirmDeleteProductKeyboard(productId) {
  return Markup.inlineKeyboard([
    [k.btn("✅ Yes, Delete", `delyes:${productId}`)],
    [k.btn("❌ Cancel", "delno")],
  ]);
}

function shopEditKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("🏷 Shop Name", "eshop_name")],
    [k.btn("📝 Description", "eshop_desc")],
    [k.btn("📞 Phone", "eshop_phone")],
    [k.btn("📍 Location", "eshop_loc")],
    [k.btn("⬅️ Back", "sdash")],
  ]);
}

module.exports = {
  sellerDashboardKeyboard,
  ownProductsKeyboard,
  sellerProductCardKeyboard,
  editProductKeyboard,
  sellerOrdersPagination,
  sellerOrderActionsKeyboard,
  sellerOrderViewKeyboard,
  confirmDeleteProductKeyboard,
  shopEditKeyboard,
};