const { prisma } = require("../database/prisma");
const {
  NotFoundError,
  InsufficientStockError,
  BusinessRuleError,
} = require("../utils/errors");

async function ensureCart(userId) {
  const cart = await prisma.cart.upsert({
    where: { userId },
    create: { userId },
    update: {},
  });
  return cart;
}

async function getCart(userId) {
  await ensureCart(userId);
  return prisma.cart.findUnique({
    where: { userId },
    include: {
      items: { include: { product: { include: { seller: true } } } },
    },
  });
}

// Validates that a product may be sold right now.
async function assertPurchasable(product, requestedQty) {
  if (!product) throw new NotFoundError("Product not found.");
  if (product.status !== "APPROVED") {
    throw new BusinessRuleError("This product is not available for purchase.");
  }
  if (!product.seller || !product.seller.approved || product.seller.status !== "ACTIVE") {
    throw new BusinessRuleError("This seller account is not active.");
  }
  if (product.stock < requestedQty) {
    throw new InsufficientStockError(
      `Only ${product.stock} left in stock for "${product.name}".`
    );
  }
  return product;
}

async function addItem(userId, productId, quantity = 1) {
  const qty = Number.isInteger(quantity) && quantity > 0 ? quantity : 1;
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { seller: true },
  });
  await assertPurchasable(product, qty);

  const cart = await ensureCart(userId);
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_productId: { cartId: cart.id, productId: product.id } },
  });

  const newQty = (existing ? existing.quantity : 0) + qty;
  if (newQty > product.stock) {
    throw new InsufficientStockError(
      `Only ${product.stock} left in stock for "${product.name}".`
    );
  }

  if (existing) {
    await prisma.cartItem.update({
      where: { id: existing.id },
      data: { quantity: newQty },
    });
  } else {
    await prisma.cartItem.create({
      data: { cartId: cart.id, productId: product.id, quantity: qty },
    });
  }
  return getCart(userId);
}

async function updateQuantity(userId, productId, delta) {
  const item = await prisma.cartItem.findFirst({
    where: { cart: { userId }, productId },
    include: { product: true },
  });
  if (!item) throw new NotFoundError("Item not in your cart.");

  const newQty = item.quantity + delta;
  if (newQty <= 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
    return getCart(userId);
  }
  if (newQty > item.product.stock) {
    throw new InsufficientStockError(
      `Only ${item.product.stock} left in stock for "${item.product.name}".`
    );
  }
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: newQty } });
  return getCart(userId);
}

async function removeItem(userId, productId) {
  await prisma.cartItem.deleteMany({
    where: { cart: { userId }, productId },
  });
  return getCart(userId);
}

async function clearCart(userId) {
  const cart = await ensureCart(userId);
  await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
  return getCart(userId);
}

async function removeItems(userId, productIds) {
  if (!productIds.length) return;
  await prisma.cartItem.deleteMany({
    where: { cart: { userId }, productId: { in: productIds } },
  });
}

// Structured cart view grouped per seller with server-computed totals.
async function getCartDetailed(userId) {
  const cart = await getCart(userId);
  const items = cart.items.map((item) => ({
    ...item,
    lineTotal: item.product.price * item.quantity,
  }));
  const sellers = new Map();
  for (const item of items) {
    const sellerId = item.product.sellerId;
    const entry = sellers.get(sellerId) || {
      sellerId,
      sellerName: item.product.seller.shopName || "Shop",
      items: [],
      subtotal: 0,
      currency: item.product.currency || "ETB",
    };
    entry.items.push(item);
    entry.subtotal += item.lineTotal;
    if (!entry.currency && item.product.currency) entry.currency = item.product.currency;
    sellers.set(sellerId, entry);
  }
  const sellersArr = Array.from(sellers.values());
  const total = sellersArr.reduce((sum, s) => sum + s.subtotal, 0);
  const currency = sellersArr[0]?.currency || "ETB";
  return { cart, items, sellers: sellersArr, total, currency, count: items.length };
}

module.exports = {
  ensureCart,
  getCart,
  addItem,
  updateQuantity,
  removeItem,
  clearCart,
  removeItems,
  getCartDetailed,
  assertPurchasable,
};