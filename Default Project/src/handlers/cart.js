const { Markup } = require("telegraf");
const { session } = require("../states/session");
const kb = require("../keyboards/buyer");
const adminKb = require("../keyboards/admin");
const k = require("../keyboards/main");
const cartService = require("../services/cartService");
const checkoutService = require("../services/checkoutService");
const { cartText } = require("../utils/render");
const { escapeHtml, orderLabel } = require("../utils/formatters");
const { editOrSend, sendMainMenu } = require("../utils/telegramUI");

// ── Cart view ──────────────────────────────────────────────────────────────

async function showCart(ctx) {
  const detail = await cartService.getCartDetailed(ctx.user.id);
  if (detail.count === 0) {
    await editOrSend(
      ctx,
      "<b>🛍 Your Cart</b>\n\nYour cart is empty.\nBrowse products and add some!",
      kb.emptyCartKeyboard().reply_markup
    );
    return;
  }
  const rows = [];
  for (const seller of detail.sellers) {
    const item = seller.items[0];
    rows.push([k.btn("🏪 " + escapeHtml(seller.sellerName), "nop")]);
    for (const it of seller.items) {
      rows.push([
        k.btn("➕", `cplus:${it.id}`),
        k.btn(`${it.product.name} — ${it.quantity}`, "nop"),
        k.btn("➖", `cminus:${it.id}`),
        k.btn("❌", `crmv:${it.id}`),
      ]);
    }
  }
  rows.push([k.btn("🧹 Clear Cart", "cclear"), k.btn("✅ Checkout", "ck")]);
  rows.push([k.btn("🏠 Main Menu", "menu")]);
  await editOrSend(ctx, cartText(detail), { reply_markup: Markup.inlineKeyboard(rows).reply_markup });
}

async function cartPlus(ctx, cartItemId) {
  const item = await _getCartItem(ctx, cartItemId);
  await cartService.updateQuantity(ctx.user.id, item.productId, 1);
  await showCart(ctx);
}

async function cartMinus(ctx, cartItemId) {
  const item = await _getCartItem(ctx, cartItemId);
  await cartService.updateQuantity(ctx.user.id, item.productId, -1);
  await showCart(ctx);
}

async function cartRemove(ctx, cartItemId) {
  const item = await _getCartItem(ctx, cartItemId);
  await cartService.removeItem(ctx.user.id, item.productId);
  await showCart(ctx);
}

async function clearCart(ctx) {
  await cartService.clearCart(ctx.user.id);
  await showCart(ctx);
}

async function _getCartItem(ctx, cartItemId) {
  const detail = await cartService.getCartDetailed(ctx.user.id);
  const item = detail.items.find((i) => i.id === Number(cartItemId));
  if (!item) {
    const err = new Error("Item not in your cart.");
    err.showToUser = true;
    err.message = "That item is no longer in your cart.";
    throw err;
  }
  return item;
}

// ── Checkout flow: phone → location → note → confirm ──────────────────────

async function startCheckout(ctx) {
  const detail = await cartService.getCartDetailed(ctx.user.id);
  if (detail.count === 0) {
    await ctx.reply(
      "Your cart is empty. Add products first.",
      kb.emptyCartKeyboard().reply_markup
    );
    return;
  }
  session.set(ctx.user.id, { step: "CK_PHONE", checkout: {} });
  await ctx.reply(
    `<b>✅ Checkout</b>\n\n${cartText(detail)}\n\n` +
      `Step 1 of 4 — <b>Phone number</b>\n\n` +
      `Send your phone number as text (e.g. +251912345678), use the phone button below, or press Skip if you don't want to share it.`,
    Markup.keyboard([Markup.button.contactRequest("📱 Send my phone")])
      .oneTime()
      .resize()
  );
}

async function setCheckoutPhone(ctx, phone) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "CK_PHONE") {
    await ctx.reply("Start checkout from the cart first.", k.keyboard([[k.btn("🛍 Cart", "cart")]]));
    return;
  }
  session.update(ctx.user.id, {
    step: "CK_LOC",
    checkout: { ...st.checkout, phone: phone || null },
  });
  await ctx.reply(
    "✅ Phone saved.\n\nStep 2 of 4 — <b>Delivery location</b>\nSend your delivery address/location as text. (/cancel to cancel)"
  );
}

async function skipPhone(ctx) {
  await setCheckoutPhone(ctx, null);
}

async function requestPhone(ctx) {
  await ctx.reply(
    "Press the phone button below, or type your phone number as text.",
    Markup.keyboard([Markup.button.contactRequest("📱 Send my phone")]).oneTime().resize()
  );
}

async function setCheckoutLocation(ctx, location) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "CK_LOC") {
    await ctx.reply("Start checkout from the cart first.", k.keyboard([[k.btn("🛍 Cart", "cart")]]));
    return;
  }
  session.update(ctx.user.id, {
    step: "CK_NOTE",
    checkout: { ...st.checkout, location },
  });
  await ctx.reply(
    "✅ Location saved.\n\nStep 3 of 4 — <b>Order note (optional)</b>\nSend a note for the seller, or press Skip.",
    Markup.keyboard([Markup.button.text("⏭ Skip note")]).oneTime().resize()
  );
}

async function setCheckoutNote(ctx, note) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "CK_NOTE") {
    await ctx.reply("Start checkout from the cart first.", k.keyboard([[k.btn("🛍 Cart", "cart")]]));
    return;
  }
  session.update(ctx.user.id, {
    step: "CK_CONFIRM",
    checkout: { ...st.checkout, notes: note || null },
  });
  await showCheckoutSummary(ctx);
}

async function showCheckoutSummary(ctx) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "CK_CONFIRM") {
    await ctx.reply("Something went wrong. Please restart checkout.", k.keyboard([[k.btn("🛍 Cart", "cart")]]));
    return;
  }
  const { phone, location, notes } = st.checkout;
  const detail = await cartService.getCartDetailed(ctx.user.id);
  const lines = [
    "<b>📦 ORDER SUMMARY</b>",
    "",
    ...detail.sellers.map(
      (s) => `🏪 ${escapeHtml(s.sellerName)}\n` +
        s.items
          .map(
            (i) => `• ${escapeHtml(i.product.name)} × ${i.quantity} = ${i.lineTotal} ${i.product.currency}`
          )
          .join("\n")
    ),
    "",
    `Total: <b>${detail.total} ${detail.currency}</b>`,
    `Phone: ${escapeHtml(phone || "-")}`,
    `Delivery: ${escapeHtml(location || "-")}`,
    notes ? `Note: ${escapeHtml(notes)}` : null,
  ].filter((l) => l !== null);
  await ctx.reply(
    lines.join("\n"),
    adminKb.checkoutSummaryKeyboard("cancel").reply_markup
  );
}

async function confirmCheckout(ctx) {
  const st = session.get(ctx.user.id);
  if (!st || st.step !== "CK_CONFIRM") {
    await ctx.reply("Please restart checkout from your cart.", k.keyboard([[k.btn("🛍 Cart", "cart")]]));
    return;
  }
  const { phone, location, notes } = st.checkout;
  if (!location) {
    await ctx.reply("Delivery location is required. Please restart checkout.");
    return;
  }
  session.clear(ctx.user.id);
  const result = await checkoutService.checkout(ctx.user.id, { phone, location, notes });
  await ctx.reply(
    `<b>🎉 Order placed!</b>\n\n` +
      result.orders
        .map((o) => `• ${orderLabel(o)} — ${o.totalAmount} ${o.currency}`)
        .join("\n") +
      `\n\nEach seller has been notified. Track your orders anytime.`,
    k.keyboard([[k.btn("📦 My Orders", "orders"), k.btn("🏠 Main Menu", "menu")]])
  );
}

module.exports = {
  showCart,
  cartPlus,
  cartMinus,
  cartRemove,
  clearCart,
  startCheckout,
  setCheckoutPhone,
  skipPhone,
  requestPhone,
  setCheckoutLocation,
  setCheckoutNote,
  showCheckoutSummary,
  confirmCheckout,
};