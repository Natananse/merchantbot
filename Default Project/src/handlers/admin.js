const { Markup } = require("telegraf");
const { session } = require("../states/session");
const akb = require("../keyboards/admin");
const k = require("../keyboards/main");
const adminService = require("../services/adminService");
const sellerApplicationService = require("../services/sellerApplicationService");
const productService = require("../services/productService");
const orderService = require("../services/orderService");
const categoryService = require("../services/categoryService");
const notificationService = require("../services/notificationService");
const { env } = require("../config/env");
const { productManageText, orderCardText } = require("../utils/render");
const { escapeHtml, formatNumber } = require("../utils/formatters");
const { editOrSend } = require("../utils/telegramUI");

// ── Panel ──────────────────────────────────────────────────────────────────

async function adminPanel(ctx) {
  await editOrSend(
    ctx,
    "<b>⚙️ ADMIN PANEL</b>\n\nManage the marketplace below:",
    akb.adminPanelKeyboard().reply_markup
  );
}

async function adminStatsView(ctx) {
  const stats = await adminService.getAdminStats();
  await ctx.reply(
    `<b>📊 Marketplace Statistics</b>\n\n` +
      `👥 Users: ${stats.users} (${stats.buyers} buyers, ${stats.sellers} sellers)\n` +
      `🏪 Pending applications: ${stats.pendingApplications}\n` +
      `📦 Products: ${stats.products} (${stats.pendingProducts} pending, ${stats.approvedProducts} approved)\n` +
      `📋 Orders: ${stats.orders}\n` +
      `💰 Revenue (excl. cancelled): <b>${formatNumber(stats.revenue)} ${env.CURRENCY}</b>\n` +
      `📂 Categories: ${stats.categories}`,
    k.keyboard([[k.btn("⬅️ Back", "admin")]])
  );
}

// ── Users ──────────────────────────────────────────────────────────────────

async function adminUsers(ctx, page = 0) {
  const data = await adminService.listUsersForAdmin({ page, perPage: env.PAGE_SIZE });
  const lines = ["<b>👥 Users</b>", ""];
  for (const u of data.rows) {
    lines.push(
      `· <b>${escapeHtml(u.firstName)} ${escapeHtml(u.lastName || "")}</b> (@${escapeHtml(u.username || "-")})\n` +
        `  Role: ${u.role} · Orders: ${u._count.orders} · Joined: ${u.createdAt.toISOString().slice(0, 10)}`
    );
  }
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adusers:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adusers:${page + 1}`));
  await editOrSend(ctx, lines.join("\n"), {
    reply_markup: k.keyboard([nav, [k.btn("⬅️ Back", "admin")]]),
  });
}

// ── Seller applications ────────────────────────────────────────────────────

async function adminApplications(ctx, page = 0) {
  const data = await sellerApplicationService.listApplications({ page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>🏪 Seller Applications</b>\n\nNo pending applications.",
      k.keyboard([[k.btn("⬅️ Back", "admin")]])
    );
    return;
  }
  const lines = ["<b>🏪 Seller Applications</b>", ""];
  const rows = [];
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adapps:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adapps:${page + 1}`));
  rows.push(nav);
  for (const app of data.rows) {
    lines.push(
      `· <b>${escapeHtml(app.shopName)}</b> by ${escapeHtml(app.user.firstName)} (@${escapeHtml(app.user.username || "-")})\n` +
        `  Status: ${app.status}`
    );
    rows.push([k.btn(`👁 ${String(app.id)} · ${escapeHtml(app.shopName).slice(0, 18)}`, `appv:${app.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function adminApplicationView(ctx, appId) {
  const app = await sellerApplicationService.getApplicationById(Number(appId));
  const lines = [
    `<b>🏪 Seller Application #${app.id}</b>`,
    ``,
    `Shop: <b>${escapeHtml(app.shopName)}</b>`,
    app.description ? `Desc: ${escapeHtml(app.description)}` : null,
    `Phone: ${escapeHtml(app.phone || "-")}`,
    `Location: ${escapeHtml(app.location || "-")}`,
    ``,
    `Applicant: ${escapeHtml(app.user.firstName)} ${escapeHtml(app.user.lastName || "")} (@${escapeHtml(app.user.username || "-")})`,
    `Submitted: ${app.createdAt.toISOString().slice(0, 10)}`,
    `Status: <b>${app.status}</b>`,
    app.rejectionReason ? `Reason: ${escapeHtml(app.rejectionReason)}` : null,
  ].filter((l) => l !== null);
  const rows = [];
  if (app.status === "PENDING") {
    rows.push([k.btn("✅ Approve", `app_ap:${app.id}`), k.btn("❌ Reject", `app_rj:${app.id}`)]);
  } else if (app.status === "REJECTED" || app.status === "SUSPENDED") {
    rows.push([k.btn("✅ Approve", `app_ap:${app.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", `adapps:0`)]);
  await ctx.reply(lines.join("\n"), {
    parse_mode: "HTML",
    reply_markup: k.keyboard(rows),
  });
}

async function approveApplication(ctx, appId) {
  const app = await sellerApplicationService.approveApplication(Number(appId), ctx.user.id);
  await ctx.reply(`✅ Application #${app.id} approved. The seller was notified.`);
  await notificationService.notifyUser(
    app.userId,
    `<b>🎉 Congratulations!</b>\nYour seller application for "<b>${escapeHtml(app.shopName)}</b>" was approved.\n\nYou now have a Seller Dashboard. Press /menu → Seller Dashboard to add products.`
  );
}

async function startRejectApplication(ctx, appId) {
  session.set(ctx.user.id, { step: "ADMIN_REJECT_APP", appId: Number(appId) });
  await ctx.reply(
    "Send a <b>reason</b> for rejecting this application. (or /cancel)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function finishRejectApplication(ctx, reason) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "ADMIN_REJECT_APP") return;
  const app = await sellerApplicationService.rejectApplication(st.appId, reason, ctx.user.id);
  session.clear(ctx.user.id);
  await ctx.reply(`✅ Application #${app.id} rejected.`);
  await notificationService.notifyUser(
    app.userId,
    `<b>❌ Your seller application was rejected.</b>\n\nReason: ${escapeHtml(reason)}\n\nYou can apply again later.`
  );
}

// ── Products ───────────────────────────────────────────────────────────────

async function adminPendingProducts(ctx, page = 0) {
  const data = await productService.listProductsByStatus("PENDING", { page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📦 Pending Products</b>\n\nNo products await approval.",
      k.keyboard([[k.btn("⬅️ Back", "admin")]])
    );
    return;
  }
  const lines = ["<b>📦 Pending Products</b>", ""];
  const rows = [];
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adpends:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adpends:${page + 1}`));
  rows.push(nav);
  for (const p of data.rows) {
    lines.push(
      `· <b>${escapeHtml(p.name)}</b> — ${p.price} ${p.currency}\n  Shop: ${escapeHtml(p.seller?.shopName || "-")}`
    );
    rows.push([k.btn(`👁 ${escapeHtml(p.name).slice(0, 22)}`, `adpv:${p.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function adminAllProducts(ctx, page = 0) {
  const data = await productService.listProductsByStatus(null, { page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📦 Products</b>\n\nNo products yet.",
      k.keyboard([[k.btn("⬅️ Back", "admin")]])
    );
    return;
  }
  const lines = ["<b>📦 All Products</b>", ""];
  const rows = [];
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adprod:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adprod:${page + 1}`));
  rows.push(nav);
  for (const p of data.rows) {
    lines.push(
      `· <b>${escapeHtml(p.name)}</b> — ${p.price} ${p.currency} · ${p.status}\n  Shop: ${escapeHtml(p.seller?.shopName || "-")}`
    );
    rows.push([k.btn(`👁 ${escapeHtml(p.name).slice(0, 22)}`, `adpv:${p.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function adminProductView(ctx, productId) {
  const product = await productService.getProductById(Number(productId));
  await ctx.reply(productManageText(product), {
    parse_mode: "HTML",
    reply_markup: _adminProductKeyboard(product),
  });
}

function _adminProductKeyboard(product) {
  const rows = [];
  const actions = [];
  if (product.status === "PENDING" || product.status === "REJECTED") {
    actions.push(k.btn("✅ Approve", `apdp:${product.id}`));
  }
  if (product.status === "PENDING" || product.status === "APPROVED" || product.status === "REJECTED") {
    actions.push(k.btn("❌ Reject", `arjpd:${product.id}`));
  }
  if (product.status === "APPROVED") {
    actions.push(k.btn("🚫 Hide", `adm_hide:${product.id}`));
  }
  if (product.status === "INACTIVE" || product.status === "SOLD_OUT") {
    actions.push(k.btn("▶️ Activate", `adm_show:${product.id}`));
  }
  if (actions.length) rows.push(actions);
  rows.push([k.btn("⬅️ Back to Admin", "admin")]);
  return k.keyboard(rows);
}

async function approveProduct(ctx, productId) {
  const product = await productService.moderateProduct(Number(productId), "APPROVED", null, ctx.user.id);
  await ctx.reply(`✅ Product #${product.id} approved and is now live in the marketplace.`);
  await notificationService.notifyUser(
    product.seller.userId,
    `<b>✅ Your product "<b>${escapeHtml(product.name)}</b>" was approved and is now visible in the marketplace.</b>`
  );
}

async function startRejectProduct(ctx, productId) {
  session.set(ctx.user.id, { step: "ADMIN_REJECT_PRODUCT", productId: Number(productId) });
  await ctx.reply(
    "Send a <b>reason</b> for rejecting this product. (or /cancel)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function finishRejectProduct(ctx, reason) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "ADMIN_REJECT_PRODUCT") return;
  const product = await productService.moderateProduct(st.productId, "REJECTED", reason, ctx.user.id);
  session.clear(ctx.user.id);
  await ctx.reply(`✅ Product #${product.id} rejected.`);
  await notificationService.notifyUser(
    product.seller.userId,
    `<b>❌ Your product "<b>${escapeHtml(product.name)}</b>" was rejected.</b>\n\nReason: ${escapeHtml(reason)}\n\nYou can edit it and it will be re-reviewed, or contact support.`
  );
}

async function adminHideProduct(ctx, productId) {
  const product = await productService.moderateProduct(Number(productId), "INACTIVE", null, ctx.user.id);
  await ctx.reply(`👍 Product #${product.id} hidden from the marketplace.`);
}

async function adminActivateProduct(ctx, productId) {
  const product = await productService.moderateProduct(Number(productId), "APPROVED", null, ctx.user.id);
  await ctx.reply(`✅ Product #${product.id} is live in the marketplace again.`);
}

// ── Orders ─────────────────────────────────────────────────────────────────

async function adminOrders(ctx, page = 0) {
  const data = await orderService.listAllOrders({ page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📋 Orders</b>\n\nNo orders yet.",
      k.keyboard([[k.btn("⬅️ Back", "admin")]])
    );
    return;
  }
  const lines = ["<b>📋 Orders</b>", ""];
  const rows = [];
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adords:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adords:${page + 1}`));
  rows.push(nav);
  for (const o of data.rows) {
    lines.push(
      `· <b>#${String(o.id).padStart(4, "0")}</b> — ${o.totalAmount} ${o.currency} · ${o.status}\n  Buyer: ${escapeHtml(o.buyer?.firstName || "-")} · Shop: ${escapeHtml(o.seller?.shopName || "-")}`
    );
    rows.push([k.btn(`👁 #${String(o.id).padStart(4, "0")}`, `adov:${o.id}`)]);
  }
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function adminOrderView(ctx, orderId) {
  const order = await orderService.getOrderById(Number(orderId), { full: true });
  const canCancel = !["DELIVERED", "CANCELLED"].includes(order.status);
  await ctx.reply(orderCardText(order), {
    parse_mode: "HTML",
    reply_markup: akb.adminOrderViewKeyboard(order.id, canCancel).reply_markup,
  });
}

async function adminCancelOrder(ctx, orderId) {
  if (["DELIVERED", "CANCELLED"].includes((await orderService.getOrderById(Number(orderId))).status)) {
    await ctx.reply("This order cannot be cancelled.");
    return;
  }
  await orderService.changeStatus(Number(orderId), "CANCELLED", ctx.user.id, { actor: "admin" });
  await ctx.reply("❌ Order cancelled.");
}

// ── Sellers ────────────────────────────────────────────────────────────────

async function adminSellers(ctx, page = 0) {
  const data = await adminService.listAllSellers({ page, perPage: env.PAGE_SIZE });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>🏪 Sellers</b>\n\nNo sellers yet.",
      k.keyboard([[k.btn("⬅️ Back", "admin")]])
    );
    return;
  }
  const lines = ["<b>🏪 Sellers</b>", ""];
  const rows = [];
  const nav = [];
  if (page > 0) nav.push(k.btn("⬅️ Prev", `adsellers:${page - 1}`));
  nav.push(k.btn(`${page + 1}/${data.pages}`, "nop"));
  if (page < data.pages - 1) nav.push(k.btn("Next ➡️", `adsellers:${page + 1}`));
  rows.push(nav);
  for (const s of data.rows) {
    lines.push(
      `· <b>${escapeHtml(s.shopName)}</b> (@${escapeHtml(s.user.username || "-")})\n  Status: ${s.status} · Products: ${s._count.products} · Orders: ${s._count.orders}`
    );
    const actions = [];
    if (s.status === "SUSPENDED" || s.approved === false) {
      actions.push(k.btn("✅ Activate", `actv:${s.userId}`));
    } else {
      actions.push(k.btn("🚫 Suspend", `susc:${s.userId}`));
    }
    rows.push(actions);
  }
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function suspendSeller(ctx, userId) {
  const seller = await _sellerByUser(Number(userId));
  await sellerApplicationService.setSellerSuspended(seller.id, true, ctx.user.id);
  await ctx.reply(`🚫 Seller @${seller.user.username || seller.user.firstName} suspended. Their products are hidden.`);
}

async function activateSeller(ctx, userId) {
  const seller = await _sellerByUser(Number(userId));
  await sellerApplicationService.setSellerSuspended(seller.id, false, ctx.user.id);
  await ctx.reply(`✅ Seller @${seller.user.username || seller.user.firstName} activated.`);
}

async function _sellerByUser(userId) {
  const sellerService = require("../services/sellerService");
  return sellerService.getSellerProfileByUserId(userId);
}

// ── Categories ─────────────────────────────────────────────────────────────

async function adminCategories(ctx) {
  const categories = await categoryService.listCategories();
  const lines = ["<b>📂 Categories</b>", ""];
  for (const c of categories) {
    lines.push(`· ${c.emoji ? c.emoji + " " : ""}${escapeHtml(c.name)} (${c._count.products} products)`);
  }
  const rows = categories.map((c) => [
    k.btn(`🗑 ${escapeHtml(c.name).slice(0, 20)}`, `catdel:${c.id}`),
  ]);
  rows.push([k.btn("➕ Add Category", "catadd")]);
  rows.push([k.btn("⬅️ Back", "admin")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function startCreateCategory(ctx) {
  session.set(ctx.user.id, { step: "ADMIN_CREATE_CATEGORY" });
  await ctx.reply(
    "Send the name of the new <b>category</b>. You may also include an emoji first, e.g. 📱 Phones. (/cancel to abort)",
    Markup.inlineKeyboard([[k.btn("❌ Cancel", "cancel")]])
  );
}

async function saveCategory(ctx, name) {
  const clean = name.trim();
  const emojiMatch = /^(\p{Emoji}\s*)+/.exec(clean);
  const emoji = emojiMatch ? emojiMatch[0].trim() : null;
  const categoryName = emoji ? clean.slice(emoji.length).trim() : clean;
  const category = await categoryService.createCategory(categoryName, null);
  session.clear(ctx.user.id);
  await ctx.reply(`✅ Category "${escapeHtml(category.name)}" created.`);
  await adminCategories(ctx);
}

async function deleteCategory(ctx, categoryId) {
  try {
    const category = await categoryService.deleteCategory(Number(categoryId));
    await ctx.reply(`🗑 Category "${escapeHtml(category.name)}" deleted.`);
  } catch (err) {
    await ctx.reply(`⚠️ ${err.message}`);
  }
}

module.exports = {
  adminPanel,
  adminStatsView,
  adminUsers,
  adminApplications,
  adminApplicationView,
  approveApplication,
  startRejectApplication,
  finishRejectApplication,
  adminPendingProducts,
  adminAllProducts,
  adminProductView,
  approveProduct,
  startRejectProduct,
  finishRejectProduct,
  adminHideProduct,
  adminActivateProduct,
  adminOrders,
  adminOrderView,
  adminCancelOrder,
  adminSellers,
  suspendSeller,
  activateSeller,
  adminCategories,
  startCreateCategory,
  saveCategory,
  deleteCategory,
};