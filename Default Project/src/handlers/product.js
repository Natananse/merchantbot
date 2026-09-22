const { Markup } = require("telegraf");
const { session } = require("../states/session");
const skb = require("../keyboards/seller");
const pkb = require("../keyboards/product");
const k = require("../keyboards/main");
const productService = require("../services/productService");
const categoryService = require("../services/categoryService");
const { env } = require("../config/env");
const { newProductReviewText } = require("../utils/render");
const { productManageText } = require("../utils/render");
const { escapeHtml } = require("../utils/formatters");
const { editOrSend } = require("../utils/telegramUI");

// ── Start "Add Product" ────────────────────────────────────────────────────

async function startAddProduct(ctx) {
  const seller = await productService.requireApprovedSeller(ctx.user.id);
  session.set(ctx.user.id, { step: "PD_NAME", draft: { sellerId: seller.id } });
  await ctx.reply(
    "<b>➕ Add Product</b>\n\nStep 1 of 7 — <b>Product name</b>\nSend the product name. (/cancel to abort)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function showCategoryPicker(ctx, page = 0) {
  const categories = await categoryService.listCategories();
  const picker = pkb.categoryPicker(categories, { page, pageSize: 6 });
  await editOrSend(
    ctx,
    "Select a <b>category</b> for your product:",
    picker.keyboard.reply_markup
  );
}

async function pickCategory(ctx, categoryId) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "PD_CAT") {
    await startAddProduct(ctx);
    return;
  }
  const category = await categoryService.getCategoryById(Number(categoryId));
  session.update(ctx.user.id, {
    step: "PD_PRICE",
    draft: { ...st.draft, categoryId: category.id, categoryName: category.name },
  });
  await ctx.reply(
    `✅ Category: <b>${escapeHtml(category.name)}</b>\n\nStep 4 of 7 — <b>Price</b>\nHow much does it cost? Send a number (e.g. 500).`,
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function chooseCurrency(ctx, choice) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "PD_CURRENCY") return;
  const supported = choice === "other" ? (env.CURRENCY === "ETB" ? "USD" : "ETB") : env.CURRENCY;
  session.update(ctx.user.id, {
    step: "PD_STOCK",
    draft: { ...st.draft, currency: supported },
  });
  await ctx.reply(
    `✅ Currency: <b>${supported}</b>\n\nStep 6 of 7 — <b>Stock</b>\nHow many units are available? Send a whole number (0 or more).`,
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function showReview(ctx) {
  const st = session.get(ctx.user.id);
  if (!st || !st.draft) {
    await ctx.reply("Restart product creation.", k.keyboard([[k.btn("🏠 Main Menu", "menu")]]));
    return;
  }
  const categories = (await categoryService.listCategories()).filter((c) => c.id === Number(st.draft.categoryId));
  const byId = new Map(categories.map((c) => [c.id, c]));
  session.update(ctx.user.id, { step: "PD_REVIEW" });
  await ctx.reply(
    newProductReviewText(st.draft, byId),
    pkb.productConfirmKeyboard().reply_markup
  );
}

async function submitProduct(ctx) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "PD_REVIEW" || !st.draft) {
    await ctx.reply("Restart product creation.", k.keyboard([[k.btn("🏠 Main Menu", "menu")]]));
    return;
  }
  const draft = st.draft;
  const product = await productService.createProduct({
    userId: ctx.user.id,
    sellerId: draft.sellerId,
    name: draft.name,
    description: draft.description,
    categoryId: draft.categoryId,
    price: draft.price,
    currency: draft.currency || env.CURRENCY,
    stock: draft.stock,
    imageUrl: draft.imageUrl || null,
    images: draft.images || [],
    location: draft.location || null,
    deliveryInfo: draft.deliveryInfo || null,
  });
  session.clear(ctx.user.id);
  await ctx.reply(
    `<b>✅ Product submitted!</b>\n\n"<b>${escapeHtml(product.name)}</b>" was created with status <b>PENDING</b>.\n` +
      `The admin will review it. Once approved, it will appear in the marketplace immediately.\n\nStatus: + New Product submitted · awaiting moderation.`,
    k.keyboard([[k.btn("🏪 Seller Dashboard", "sdash"), k.btn("🏠 Main Menu", "menu")]])
  );
  const notificationService = require("../services/notificationService");
  await notificationService.notifyAdmin(
    `<b>🆕 NEW PRODUCT</b>\n\n` +
      `Seller: ${escapeHtml(ctx.user.firstName)} ${escapeHtml(ctx.user.lastName || "")}\n` +
      `Shop: ${escapeHtml((ctx.seller && ctx.seller.shopName) || "-")}\n` +
      `Product: <b>${escapeHtml(product.name)}</b>\n` +
      `Category: ${escapeHtml(draft.categoryName || "-")}\n` +
      `Price: ${draft.price} ${draft.currency || env.CURRENCY}\n` +
      `Stock: ${draft.stock}\n\n` +
      `Open Admin Panel → Pending Products to review.`
  );
}

// ── My products list ───────────────────────────────────────────────────────

async function myProducts(ctx, page = 0) {
  const data = await productService.listSellerProductsForDashboard(ctx.seller.id, { page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📦 My Products</b>\n\nYou haven't published any products yet.",
      k.keyboard([
        [k.btn("➕ Add Product", "addp")],
        [k.btn("⬅️ Back", "sdash")],
      ])
    );
    return;
  }
  const lines = ["<b>📦 My Products</b>", ""];
  for (const product of data.rows) {
    lines.push(
      `· <b>${escapeHtml(product.name)}</b> — ${product.price} ${product.currency} (${product.stock} pcs)\n` +
        `  Status: ${product.status}`
    );
  }
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `myp:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `myp:${page + 1}`));
  const rows = [nav];
  for (const product of data.rows) {
    rows.push([k.btn(`👁 ${escapeHtml(product.name).slice(0, 24)}`, `spm:${product.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "sdash")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function showSellerProductManage(ctx, productId) {
  const product = await productService.getSellerProduct(ctx.seller.id, productId);
  const kb_ = skb.sellerProductCardKeyboard(product.id, product.status);
  await ctx.reply(productManageText(product), {
    parse_mode: "HTML",
    reply_markup: kb_.reply_markup,
  });
}

// ── Edit one field ─────────────────────────────────────────────────────────

async function editProductMenu(ctx, productId) {
  const product = await productService.getSellerProduct(ctx.seller.id, productId);
  await ctx.reply(
    `Editing <b>${escapeHtml(product.name)}</b>\n\nChoose a field to change:`,
    skb.editProductKeyboard(product.id).reply_markup
  );
}

async function startEditField(ctx, field, productId) {
  const stepMap = {
    name: "EDIT_NAME",
    description: "EDIT_DESC",
    price: "EDIT_PRICE",
    currency: "EDIT_CURRENCY",
    stock: "EDIT_STOCK",
    image: "EDIT_IMAGE",
    location: "EDIT_LOC",
    deliveryInfo: "EDIT_DELIVERY",
  };
  const product = await productService.getSellerProduct(ctx.seller.id, productId);
  const prompt = {
    name: "Send the new <b>name</b>:",
    description: "Send the new <b>description</b>:",
    price: "Send the new <b>price</b> (number):",
    currency: "Send the new <b>currency</b> code (e.g. ETB, USD):",
    stock: "Send the new <b>stock</b> (whole number):",
    image: "Send a <b>photo</b> or an image <b>URL</b>:",
    location: "Send the new <b>location</b>:",
    deliveryInfo: "Send the new <b>delivery info</b>:",
  };
  session.set(ctx.user.id, { step: stepMap[field], productId: product.id });
  await ctx.reply(prompt[field], Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]]));
}

async function saveEditField(ctx, field, value) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== field || !st.productId) return;
  const updates = {
    EDIT_NAME: { name: value },
    EDIT_DESC: { description: value },
    EDIT_PRICE: { price: value },
    EDIT_CURRENCY: { currency: value },
    EDIT_STOCK: { stock: value },
    EDIT_LOC: { location: value },
    EDIT_DELIVERY: { deliveryInfo: value },
  };
  const patch = updates[field];
  if (!patch) return;
  const updated = await productService.updateProduct(ctx.user.id, ctx.seller.id, st.productId, patch);
  session.clear(ctx.user.id);
  await ctx.reply("✅ Updated!", k.keyboard([[k.btn("⬅️ Back", "myp")]]));
  void updated;
}

async function toggleProduct(ctx, productId) {
  const product = await productService.toggleActive(ctx.user.id, ctx.seller.id, productId);
  await ctx.reply(
    `✅ Product is now <b>${product.status}</b>.`,
    k.keyboard([[k.btn("⬅️ Back", "myp")]])
  );
}

// ── Delete ─────────────────────────────────────────────────────────────────

async function confirmDeleteProduct(ctx, productId) {
  const product = await productService.getSellerProduct(ctx.seller.id, productId);
  await ctx.reply(
    `<b>Delete "<b>${escapeHtml(product.name)}</b>"?</b>\n\nThis will hide the product from the marketplace. Orders that already exist are kept safe.`,
    skb.confirmDeleteProductKeyboard(product.id).reply_markup
  );
}

async function deleteProduct(ctx, productId) {
  const product = await productService.deactivateProduct(ctx.user.id, ctx.seller.id, productId);
  await ctx.reply(
    `🗑 "<b>${escapeHtml(product.name)}</b>" was deleted (hidden from marketplace).`,
    k.keyboard([[k.btn("⬅️ Back", "myp")]])
  );
  void product;
}

module.exports = {
  startAddProduct,
  showCategoryPicker,
  pickCategory,
  chooseCurrency,
  showReview,
  submitProduct,
  myProducts,
  showSellerProductManage,
  editProductMenu,
  startEditField,
  saveEditField,
  toggleProduct,
  confirmDeleteProduct,
  deleteProduct,
};