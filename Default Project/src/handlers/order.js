const { env } = require("../config/env");
const kb = require("../keyboards/buyer");
const skb = require("../keyboards/seller");
const k = require("../keyboards/main");
const orderService = require("../services/orderService");
const { orderCardText } = require("../utils/render");
const { escapeHtml, orderLabel, statusIcon } = require("../utils/formatters");
const { editOrSend } = require("../utils/telegramUI");

// ── Buyer: order history ───────────────────────────────────────────────────

async function buyerOrders(ctx, page = 0) {
  const data = await orderService.listBuyerOrders(ctx.user.id, {
    page,
    perPage: env.PAGE_SIZE,
  });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📦 My Orders</b>\n\nYou have no orders yet.",
      k.keyboard([
        [k.btn("🛒 Browse Products", "browse")],
        [k.btn("🏠 Main Menu", "menu")],
      ])
    );
    return;
  }
  const lines = ["<b>📦 My Orders</b>", ""];
  for (const order of data.rows) {
    lines.push(
      `${statusIcon(order.status)} <b>${orderLabel(order)}</b> — ${order.totalAmount} ${order.currency}\n` +
        `Status: ${order.status} · Items: ${order.items.length}`
    );
  }
  const rows = [kb.buyerOrdersPagination({ page, pages: data.pages })[0]];
  for (const order of data.rows) {
    rows.push([k.btn(`👁 ${orderLabel(order)}`, `ordv:${order.id}`)]);
  }
  rows.push([k.btn("🏠 Main Menu", "menu")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function buyerOrderView(ctx, orderId) {
  const order = await orderService.getOrderById(orderId, { full: true });
  if (order.buyerId !== ctx.user.id) {
    throw new Error("You can only view your own orders.");
  }
  await ctx.reply(orderCardText(order), {
    parse_mode: "HTML",
    reply_markup: kb.buyerOrderViewKeyboard(order).reply_markup,
  });
}

async function buyerCancelOrder(ctx, orderId) {
  await orderService.changeStatus(orderId, "CANCELLED", ctx.user.id, { actor: "buyer" });
  await ctx.reply("❌ Your order was cancelled.", k.keyboard([[k.btn("📦 My Orders", "orders")]]));
}

// ── Seller: incoming orders ────────────────────────────────────────────────

async function sellerOrders(ctx, page = 0) {
  if (!ctx.seller) {
    await ctx.reply("Seller account required.", k.keyboard([[k.btn("🏠 Main Menu", "menu")]]));
    return;
  }
  const data = await orderService.listSellerOrders(ctx.seller.id, {
    page,
    perPage: env.PAGE_SIZE,
  });
  if (data.total === 0) {
    await editOrSend(
      ctx,
      "<b>📋 Incoming Orders</b>\n\nNo orders yet. When a buyer orders, you'll see it here.",
      k.keyboard([[k.btn("⬅️ Back", "sdash")]])
    );
    return;
  }
  const lines = ["<b>📋 Incoming Orders</b>", ""];
  for (const order of data.rows) {
    lines.push(
      `${statusIcon(order.status)} <b>${orderLabel(order)}</b> — ${order.totalAmount} ${order.currency}\n` +
        `Customer: ${escapeHtml(order.buyer?.firstName || "-")} · Status: <b>${order.status}</b>`
    );
  }
  const rows = [skb.sellerOrdersPagination({ page, pages: data.pages })[0]];
  for (const order of data.rows) {
    rows.push([
      k.btn(`👁 ${orderLabel(order)} (${order.status})`, `sordview:${order.id}`),
    ]);
  }
  rows.push([k.btn("🏠 Main Menu", "menu")]);
  await editOrSend(ctx, lines.join("\n"), { reply_markup: k.keyboard(rows) });
}

async function sellerOrderView(ctx, orderId) {
  const order = await orderService.getOrderById(orderId, { full: true });
  if (!ctx.seller || order.sellerId !== ctx.seller.id) {
    throw new Error("You can only view your own orders.");
  }
  const kb_ = skb.sellerOrderViewKeyboard(order, orderService.TRANSITIONS);
  await ctx.reply(orderCardText(order), {
    parse_mode: "HTML",
    reply_markup: kb_.reply_markup,
  });
}

async function sellerStatusUpdate(ctx, orderId, code) {
  const nextStatus = orderService.parseStatusCode(code);
  if (!nextStatus) throw new Error("Invalid status code.");
  // Ownership verified inside via getOrderById + seller id.
  const order = await orderService.getOrderById(orderId);
  if (order.sellerId !== ctx.seller.id) {
    throw new Error("You can only update your own orders.");
  }
  await orderService.changeStatus(orderId, nextStatus, ctx.user.id, { actor: "seller" });
  await ctx.reply(
    `✅ Order ${orderLabel(order)} changed to <b>${nextStatus}</b>. The buyer has been notified.`,
    k.keyboard([[k.btn("📋 Orders", "sorders")]])
  );
}

module.exports = {
  buyerOrders,
  buyerOrderView,
  buyerCancelOrder,
  sellerOrders,
  sellerOrderView,
  sellerStatusUpdate,
};