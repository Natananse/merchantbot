const { Markup } = require("telegraf");
const k = require("./main");
const { env } = require("../config/env");

// Category picker used while adding a product.
function categoryPicker(categories, { page = 0, pageSize = 6 } = {}) {
  const rows = [];
  const slice = categories.slice(page * pageSize, page * pageSize + pageSize);
  for (const cat of slice) {
    rows.push([k.btn((cat.emoji ? cat.emoji + " " : "") + cat.name, `pd_cat:${cat.id}`)]);
  }
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `pd_catp:${page - 1}`));
  if (page * pageSize + pageSize < categories.length)
    nav.push(k.btn("Next ➡️", `pd_catp:${page + 1}`));
  if (nav.length) rows.push(nav);
  rows.push([k.btn("❌ Cancel", "cancel")]);
  return { keyboard: Markup.inlineKeyboard(rows), page };
}

function currencyPicker() {
  return Markup.inlineKeyboard([
    [k.btn(`${env.CURRENCY} (default)`, "pd_cur:default")],
    [k.btn(env.CURRENCY === "ETB" ? "USD" : "ETB", "pd_cur:other")],
    [k.btn("❌ Cancel", "cancel")],
  ]);
}

function productConfirmKeyboard() {
  return Markup.inlineKeyboard([
    [k.btn("✅ Publish Product", "pdpub")],
    [k.btn("❌ Cancel", "cancel")],
  ]);
}

function imageStepKeyboard(hasImages) {
  return Markup.inlineKeyboard([
    [
      ...(hasImages && hasImages.length ? [k.btn("✅ Done", "pd_img_done")] : []),
      k.btn("⏭ Skip Images", "pd_img_skip"),
    ],
    [k.btn("❌ Cancel", "cancel")],
  ]);
}

// Confirm-delete used in product management.
function confirmDeleteKeyboard(actionYes) {
  return Markup.inlineKeyboard([
    [k.btn("✅ Yes", actionYes)],
    [k.btn("❌ No, Keep It", "delno")],
  ]);
}

module.exports = {
  categoryPicker,
  currencyPicker,
  productConfirmKeyboard,
  imageStepKeyboard,
  confirmDeleteKeyboard,
};