const { prisma } = require("../database/prisma");
const { env } = require("../config/env");
const cartService = require("./cartService");
const notificationService = require("./notificationService");
const auditService = require("./auditService");
const {
  BusinessRuleError,
  InsufficientStockError,
} = require("../utils/errors");
const { escapeHtml, formatPrice, orderLabel } = require("../utils/formatters");
const { log } = require("../utils/logger");

function makeOrderNumber() {
  return (
    "ORD" +
    Date.now().toString(36).toUpperCase() +
    Math.random().toString(36).slice(2, 8).toUpperCase()
  );
}

/**
 * Checkout in ONE database transaction.
 *
 * 1. Reload the cart inside the transaction.
 * 2. Validate product status, seller status and stock.
 * 3. Compute totals from the CURRENT database prices (price protection).
 * 4. Group items per seller and create one Order per seller.
 * 5. Reduce stock with a guard (stock >= qty) so two buyers can never
 *    oversell the same stock — rollback if any guard fails.
 * 6. Remove purchased cart items.
 *
 * Returns { checkoutGroup, orders, lowStockProducts }. Nothing is written
 * unless every step succeeds.
 */
async function checkout(userId, { phone, location, notes }) {
  const txResult = await prisma.$transaction(async (tx) => {
    const cart = await tx.cart.findUnique({
      where: { userId },
      include: {
        items: {
          include: { product: { include: { seller: true } } },
        },
      },
    });

    const items = cart?.items || [];
    if (items.length === 0) {
      throw new BusinessRuleError("Your cart is empty. Add products first.");
    }

    // ---- validate everything ------------------------------------------
    for (const item of items) {
      const product = item.product;
      if (!product || product.status !== "APPROVED") {
        throw new BusinessRuleError(
          `"${product ? product.name : "A product"}" is no longer available.`
        );
      }
      if (
        !product.seller ||
        !product.seller.approved ||
        product.seller.status !== "ACTIVE"
      ) {
        throw new BusinessRuleError("One of the sellers is no longer active.");
      }
      if (product.stock < item.quantity) {
        throw new InsufficientStockError(
          `Not enough stock for "${product.name}". Only ${product.stock} left.`
        );
      }
    }

    // ---- group per seller ---------------------------------------------
    const sellerGroups = new Map();
    for (const item of items) {
      const sellerId = item.product.sellerId;
      const entry = sellerGroups.get(sellerId) || {
        sellerId,
        sellerName: item.product.seller.shopName || "Shop",
        items: [],
        total: 0,
        currency: item.product.currency || env.CURRENCY,
      };
      entry.items.push(item);
      entry.total += item.product.price * item.quantity;
      sellerGroups.set(sellerId, entry);
    }

    const grandTotal = Array.from(sellerGroups.values()).reduce(
      (sum, g) => sum + g.total,
      0
    );

    // ---- checkout group (ties one purchase together) -------------------
    const checkoutGroup = await tx.checkoutGroup.create({
      data: {
        buyerId: userId,
        totalAmount: grandTotal,
      },
    });

    // ---- reduce stock + create orders ----------------------------------
    const lowStockProducts = [];
    const orders = [];

    for (const [sellerId, group] of sellerGroups) {
      // Reduce stock one item at a time with an atomic guard.
      for (const item of group.items) {
        const product = item.product;
        const current = await tx.product.findUnique({ where: { id: product.id } });
        const newStock = current.stock - item.quantity;
        const updated = await tx.product.updateMany({
          where: { id: product.id, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        });
        if (updated.count === 0) {
          throw new InsufficientStockError(
            `Not enough stock for "${product.name}".`
          );
        }
        if (newStock === 0 && current.status === "APPROVED") {
          await tx.product.update({
            where: { id: product.id },
            data: { status: "SOLD_OUT" },
          });
        }
        if (newStock <= env.LOW_STOCK_THRESHOLD) {
          lowStockProducts.push({
            sellerProfileId: sellerId,
            productId: product.id,
            name: product.name,
            stock: Math.max(0, newStock),
          });
        }
      }

      const order = await tx.order.create({
        data: {
          orderNumber: makeOrderNumber(),
          buyerId: userId,
          sellerId,
          checkoutGroupId: checkoutGroup.id,
          totalAmount: group.total,
          currency: group.currency,
          status: "PENDING",
          deliveryLocation: location || null,
          buyerPhone: phone || null,
          notes: notes || null,
          items: {
            create: group.items.map((item) => ({
              productId: item.product.id,
              productName: item.product.name,
              price: item.product.price,
              currency: item.product.currency || env.CURRENCY,
              quantity: item.quantity,
              subtotal: item.product.price * item.quantity,
            })),
          },
          statusHistory: {
            create: [{ oldStatus: "PENDING", newStatus: "PENDING", changedBy: "system" }],
          },
        },
        include: { items: true },
      });
      orders.push(order);
    }

    // ---- clear purchased items -----------------------------------------
    const purchasedProductIds = items.map((item) => item.productId);
    await tx.cartItem.deleteMany({
      where: { cartId: cart.id, productId: { in: purchasedProductIds } },
    });

    await auditService.log({
      userId,
      action: "ORDER_CREATED",
      entityType: "CheckoutGroup",
      entityId: checkoutGroup.id,
      metadata: {
        orderIds: orders.map((o) => o.id),
        total: grandTotal,
        orderCount: orders.length,
      },
      client: tx,
    });

    return { checkoutGroup, orders, lowStockProducts, phone, location, notes };
  });

  // ---- notifications (after commit — never inside the transaction) ----
  await notifyBuyerAndSellers(userId, txResult);
  log("CHECKOUT", { userId, orders: txResult.orders.map((o) => o.id).join(",") });

  return txResult;
}

async function notifyBuyerAndSellers(userId, result) {
  const buyer = await prisma.user.findUnique({ where: { id: userId } });
  const buyerName = buyer ? buyer.firstName : "Buyer";

  const orderLines = result.orders
    .map((order) => {
      const items = order.items
        .map(
          (item) =>
            `• ${escapeHtml(item.productName)} × ${item.quantity} = ${formatPrice(
              item.subtotal,
              item.currency
            )}`
        )
        .join("\n");
      return `<b>${orderLabel(order)}</b> (${formatPrice(order.totalAmount, order.currency)})\n${items}`;
    })
    .join("\n\n");

  const buyerMessage =
    `<b>✅ Order placed!</b>\n\n` +
    orderLines +
    `\n\n<b>Total: ${formatPrice(
      result.checkoutGroup.totalAmount,
      result.orders[0]?.currency || env.CURRENCY
    )}</b>\n` +
    `📞 ${escapeHtml(result.phone || "-")}\n` +
    `📍 ${escapeHtml(result.location || "-")}` +
    (result.notes ? `\n📝 ${escapeHtml(result.notes)}` : "") +
    `\n\nYou'll be notified when the seller updates the status.\n/menu to continue.`;

  await notificationService.notifyUser(userId, buyerMessage);

  // One notification per seller, showing only their own order.
  const sellers = await prisma.sellerProfile.findMany({
    where: { id: { in: result.orders.map((o) => o.sellerId) } },
    include: { user: true },
  });
  for (const order of result.orders) {
    const seller = sellers.find((s) => s.id === order.sellerId);
    if (!seller) continue;
    const lines = order.items
      .map(
        (item) =>
          `• ${escapeHtml(item.productName)} × ${item.quantity} = ${formatPrice(
            item.subtotal,
            item.currency
          )}`
      )
      .join("\n");
    await notificationService.sendByTelegramId(
      seller.user.telegramId,
      `<b>🛒 New incoming order ${orderLabel(order)}</b> (${formatPrice(
        order.totalAmount,
        order.currency
      )})\n\n${lines}\n\n👤 ${escapeHtml(buyerName)}\n📞 ${escapeHtml(
        result.phone || "-"
      )}\n📍 ${escapeHtml(result.location || "-")}` +
        (result.notes ? `\n📝 ${escapeHtml(result.notes)}` : "") +
        `\n\nOpen /menu → Seller Dashboard → Orders to manage it.`
    );
  }

  if (result.lowStockProducts.length > 0) {
    for (const product of result.lowStockProducts) {
      await notificationService.notifySellers(
        [product.sellerProfileId],
        `⚠️ Low stock warning: "${escapeHtml(product.name)}" has only ${product.stock} left.`
      );
    }
  }
}

module.exports = { checkout };