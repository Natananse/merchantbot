const { prisma } = require("../database/prisma");
const { env } = require("../config/env");
const notificationService = require("./notificationService");
const auditService = require("./auditService");
const {
  NotFoundError,
  BusinessRuleError,
} = require("../utils/errors");
const { escapeHtml, formatPrice, orderLabel, statusIcon } = require("../utils/formatters");

// Valid seller-driven status transitions, plus cancellation rules.
const TRANSITIONS = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["READY", "CANCELLED"],
  READY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const TERMINAL_STATUSES = new Set(["DELIVERED", "CANCELLED"]);

// Matches the neutral short-codes used in callback data.
function parseStatusCode(code) {
  const map = {
    PSTART: "PENDING",
    CONF: "CONFIRMED",
    PROC: "PROCESSING",
    READY: "READY",
    DELV: "DELIVERED",
    CANC: "CANCELLED",
  };
  return map[code] || null;
}

async function getOrderById(id, { full = false } = {}) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: full
      ? {
          items: true,
          buyer: true,
          seller: { include: { user: true } },
          checkoutGroup: true,
          statusHistory: { orderBy: { createdAt: "asc" } },
        }
      : { items: true, buyer: true, seller: { include: { user: true } } },
  });
  if (!order) throw new NotFoundError("Order not found.");
  return order;
}

async function listBuyerOrders(userId, { page = 0, perPage = env.PAGE_SIZE } = {}) {
  const where = { buyerId: userId };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { items: true, seller: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function listSellerOrders(sellerProfileId, { page = 0, perPage = env.PAGE_SIZE } = {}) {
  const where = { sellerId: sellerProfileId };
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { items: true, buyer: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function listAllOrders({ page = 0, perPage = env.PAGE_SIZE, status = null } = {}) {
  const where = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { buyer: true, seller: true, items: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function assertCanTransition(order, nextStatus, actor) {
  if (TERMINAL_STATUSES.has(order.status)) {
    throw new BusinessRuleError("This order is finished and cannot be changed.");
  }
  if (order.status === nextStatus) {
    throw new BusinessRuleError("Order is already in that status.");
  }
  const allowed = TRANSITIONS[order.status] || [];
  if (!allowed.includes(nextStatus)) {
    throw new BusinessRuleError(
      `Cannot move ${orderLabel(order)} from ${order.status} to ${nextStatus}.`
    );
  }
  if (actor === "seller" && nextStatus === "CANCELLED" && order.status !== "PENDING") {
    throw new BusinessRuleError("Only pending orders can be cancelled from the seller side.");
  }
}

// changeStatus is the ONLY place order statuses are changed.
// actor is "seller" | "buyer" | "admin". changedBy is the acting user id.
async function changeStatus(orderId, nextStatus, changedBy, { actor = "admin" } = {}) {
  const order = await getOrderById(orderId, { full: true });
  await assertCanTransition(order, nextStatus, actor);

  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.order.update({
      where: { id: orderId },
      data: { status: nextStatus },
      include: { items: true },
    });
    await tx.orderStatusHistory.create({
      data: {
        orderId,
        oldStatus: order.status,
        newStatus: nextStatus,
        changedBy: String(changedBy),
      },
    });
    await auditService.log({
      userId: typeof changedBy === "number" ? changedBy : null,
      action: "ORDER_STATUS_CHANGED",
      entityType: "Order",
      entityId: orderId,
      metadata: { from: order.status, to: nextStatus, actor },
      client: tx,
    });
    return changed;
  });

  await notifyStatusChange(order, updated, nextStatus, actor);
  return updated;
}

async function notifyStatusChange(order, updated, nextStatus, actor) {
  const sellerName = order.seller?.shopName || "Shop";
  const items = updated.items
    .map(
      (item) =>
        `• ${escapeHtml(item.productName)} × ${item.quantity} = ${formatPrice(
          item.subtotal,
          item.currency
        )}`
    )
    .join("\n");

  const text =
    `${statusIcon(nextStatus)} <b>Order ${orderLabel(order)} is now ${nextStatus}</b>\n\n` +
    items +
    `\n\n<b>Total: ${formatPrice(order.totalAmount, order.currency)}</b>\n` +
    `Seller: ${escapeHtml(sellerName)}`;

  // Notify the buyer unless the buyer triggered the change themselves.
  if (actor !== "buyer") {
    await notificationService.notifyUser(order.buyerId, text);
  }
}

async function getOrderStats() {
  const [total, pending, confirmed, processing, ready, delivered, cancelled, revenue] =
    await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { status: "PENDING" } }),
      prisma.order.count({ where: { status: "CONFIRMED" } }),
      prisma.order.count({ where: { status: "PROCESSING" } }),
      prisma.order.count({ where: { status: "READY" } }),
      prisma.order.count({ where: { status: "DELIVERED" } }),
      prisma.order.count({ where: { status: "CANCELLED" } }),
      prisma.order.aggregate({
        where: { status: { not: "CANCELLED" } },
        _sum: { totalAmount: true },
      }),
    ]);
  return {
    total,
    pending,
    confirmed,
    processing,
    ready,
    delivered,
    cancelled,
    revenue: revenue._sum.totalAmount || 0,
  };
}

module.exports = {
  TRANSITIONS,
  TERMINAL_STATUSES,
  parseStatusCode,
  getOrderById,
  listBuyerOrders,
  listSellerOrders,
  listAllOrders,
  changeStatus,
  getOrderStats,
};