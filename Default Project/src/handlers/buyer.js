const { session } = require("../states/session");
const { env } = require("../config/env");
const kb = require("../keyboards/buyer");
const k = require("../keyboards/main");
const categoryService = require("../services/categoryService");
const productService = require("../services/productService");
const sellerService = require("../services/sellerService");
const cartService = require("../services/cartService");
const { escapeHtml } = require("../utils/formatters");
const { editOrSend, sendProduct } = require("../utils/telegramUI");

// ── Browse products (paginated) ────────────────────────────────────────────

async function browse(ctx, page = 0) {
  const data = await productService.listMarketProducts({ page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📦 Browse Products</b>\n\nNo products available yet. Check back soon!",
      k.keyboard([[k.btn("🏠 Main Menu", "menu")]])
    );
    return;
  }
  const lines = [`<b>📦 Browse Products</b>`, ``];
  for (const product of data.rows) {
    lines.push(
      `· <b>${escapeHtml(product.name)}</b>\n  ${product.price} ${product.currency} — Stock: ${product.stock}`
    );
  }
  const rows = [];
  const nav = kb.paginateProducts({ page: data.page, pages: data.pages, prefix: "browse" });
  rows.push(nav);
  for (const product of data.rows) {
    rows.push([k.btn(`👁 ${escapeHtml(product.name).slice(0, 24)}`, `prod:${product.id}`)]);
  }
  rows.push([k.btn("🏠 Main Menu", "menu")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

// ── Product detail / shop view ─────────────────────────────────────────────

async function viewProduct(ctx, productId, backData = "browse") {
  const product = await productService.getMarketProduct(productId);
  const markup = kb
    .productViewKeyboardFrom(product.id, product.sellerId, backData)
    .reply_markup;
  await sendProduct(ctx, product, markup);
}

// From a category page: Back returns to the category list.
async function viewCategoryProduct(ctx, productId) {
  await viewProduct(ctx, productId, "cats");
}

// From search results: Back returns to the first search-results page.
async function viewSearchProduct(ctx, productId) {
  await viewProduct(ctx, productId, "srch:0");
}

async function viewShop(ctx, sellerId) {
  const shopView = await sellerService.getShopView(sellerId);
  const { shopCardText } = require("../utils/render");
  const rows = shopView.approvedProducts.map((p) => [
    k.btn(`👁 ${escapeHtml(p.name).slice(0, 24)}`, `prod:${p.id}`),
  ]);
  rows.push([k.btn("⬅️ Back", "browse")]);
  await ctx.reply(shopCardText(shopView), {
    parse_mode: "HTML",
    reply_markup: k.keyboard(rows),
  });
}

// ── Search ─────────────────────────────────────────────────────────────────

async function startSearch(ctx) {
  session.set(ctx.user.id, { step: "SEARCH" });
  await editOrSend(
    ctx,
    "🔎 <b>Search</b>\n\nWhat product are you looking for?\nSend a name, description or shop name. (/cancel to stop)",
    k.keyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function runSearch(ctx, query, page = 0) {
  const data = await productService.searchProducts(query, {
    page,
    perPage: env.PAGE_SIZE,
  });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      `🔎 <b>Search</b>\n\nNo results for "<b>${escapeHtml(query)}</b>".\nTry different words or browse everything.`,
      k.keyboard([
        [k.btn("🛒 Browse Products", "browse")],
        [k.btn("🏠 Main Menu", "menu")],
      ])
    );
    return;
  }
  // remember query so pagination keeps working
  session.set(ctx.user.id, { lastSearch: query });
  const lines = [`🔎 <b>Search results</b> for "<b>${escapeHtml(query)}</b>"`, ``];
  const nav = kb.paginateProducts({
    page: data.page,
    pages: data.pages,
    prefix: "srch",
  });
  const rows = [nav];
  for (const product of data.rows) {
    rows.push([
      k.btn(
        `👁 ${escapeHtml(product.name).slice(0, 24)} — ${product.price} ${product.currency}`,
        `sprod:${product.id}`
      ),
    ]);
  }
  rows.push([k.btn("⬅️ Back", "browse")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function searchPage(ctx, page) {
  const q = session.get(ctx.user.id)?.lastSearch || "";
  const data = await productService.searchProducts(q, {
    page,
    perPage: env.PAGE_SIZE,
  });
  const lines = [
    `🔎 <b>Search results</b>${q ? ` for "<b>${escapeHtml(q)}</b>"` : ""}`,
    ``,
  ];
  const rows = [kb.paginateProducts({ page, pages: data.pages, prefix: "srch" })];
  for (const product of data.rows) {
    rows.push([
      k.btn(
        `👁 ${escapeHtml(product.name).slice(0, 24)} — ${product.price} ${product.currency}`,
        `sprod:${product.id}`
      ),
    ]);
  }
  rows.push([k.btn("⬅️ Back", "browse")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function quickAdd(ctx, productId) {
  await cartService.addItem(ctx.user.id, productId, 1);
  await ctx.reply(
    "✅ Added to cart!\n\nPress 🛍 My Cart on the main menu to review or checkout.",
    k.keyboard([[k.btn("🛍 View Cart", "cart"), k.btn("🏠 Main Menu", "menu")]])
  );
}

async function buyNow(ctx, productId) {
  await cartService.addItem(ctx.user.id, productId, 1);
  const { startCheckout } = require("./cart");
  await startCheckout(ctx);
}

// ── Categories ─────────────────────────────────────────────────────────────

async function showCategories(ctx) {
  const categories = await categoryService.listCategories();
  if (!categories.length) {
    await editOrSend(
      ctx,
      "<b>📂 Categories</b>\n\nNo categories yet.",
      k.keyboard([[k.btn("🏠 Main Menu", "menu")]])
    );
    return;
  }
  const rows = categories.map((cat) => [
    k.btn(
      `${cat.emoji ? cat.emoji + " " : ""}${cat.name} (${cat._count.products})`,
      `cat:${cat.id}`
    ),
  ]);
  rows.push([k.btn("⬅️ Back", "browse")]);
  await editOrSend(ctx, "<b>📂 Categories</b>\n\nPick a category:", {
    reply_markup: k.keyboard(rows),
  });
}

async function categoryPage(ctx, categoryId, page = 0) {
  const category = await categoryService.getCategoryById(categoryId);
  const data = await categoryService.listCategoryProducts(categoryId, {
    page,
    perPage: env.PAGE_SIZE,
  });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      `<b>📂 ${escapeHtml(category.name)}</b>\n\nNo products in this category yet.`,
      k.keyboard([
        [k.btn("🗂 All Categories", "cats"), k.btn("🏠 Main Menu", "menu")],
      ])
    );
    return;
  }
  const lines = [`<b>📂 ${escapeHtml(category.name)}</b>`, ``];
  const rows = [];
  for (const product of data.rows) {
    rows.push([
      k.btn(
        `👁 ${escapeHtml(product.name).slice(0, 22)} — ${product.price} ${product.currency} `,
        `cprod:${product.id}`
      ),
    ]);
  }
  const nav = kb.paginateProducts({
    page: data.page,
    pages: data.pages,
    prefix: `catp:${categoryId}`,
  });
  rows.push(nav);
  rows.push([k.btn("⬅️ Back", "cats")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

module.exports = {
  browse,
  viewProduct,
  viewCategoryProduct,
  viewSearchProduct,
  viewShop,
  startSearch,
  runSearch,
  searchPage,
  quickAdd,
  buyNow,
  showCategories,
  categoryPage,
};