const { prisma } = require("../database/prisma");
const { NotFoundError } = require("../utils/errors");

async function getSellerProfileByUserId(userId) {
  return prisma.sellerProfile.findUnique({
    where: { userId },
    include: { user: true },
  });
}

async function getSellerProfileById(id) {
  const seller = await prisma.sellerProfile.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!seller) throw new NotFoundError("Seller not found.");
  return seller;
}

async function updateShop(userId, data) {
  return prisma.sellerProfile.update({ where: { userId }, data });
}

// Public shop view shown to buyers. Only shows approved, active sellers.
async function getShopView(sellerProfileId) {
  const seller = await getSellerProfileById(sellerProfileId);
  if (!seller.approved || seller.status !== "ACTIVE") {
    throw new NotFoundError("This shop is not available.");
  }
  const [productCount, approvedProducts] = await Promise.all([
    prisma.product.count({
      where: {
        sellerId: seller.id,
        status: "APPROVED",
      },
    }),
    prisma.product.findMany({
      where: { sellerId: seller.id, status: "APPROVED" },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
  ]);
  return { seller, productCount, approvedProducts };
}

// All seller products including non-approved ones (for the seller dashboard).
async function listSellerProducts(
  sellerProfileId,
  { page = 0, perPage = 5 } = {}
) {
  const where = { sellerId: sellerProfileId };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { images: true, category: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function getSellerStats(sellerProfileId) {
  const [totalProducts, approvedProducts, orders, revenueResult] =
    await Promise.all([
      prisma.product.count({ where: { sellerId: sellerProfileId } }),
      prisma.product.count({
        where: { sellerId: sellerProfileId, status: "APPROVED" },
      }),
      prisma.order.count({ where: { sellerId: sellerProfileId } }),
      prisma.order.aggregate({
        where: {
          sellerId: sellerProfileId,
          status: { not: "CANCELLED" },
        },
        _sum: { totalAmount: true },
      }),
    ]);
  const pendingOrders = await prisma.order.count({
    where: { sellerId: sellerProfileId, status: "PENDING" },
  });

  return {
    totalProducts,
    approvedProducts,
    orders,
    pendingOrders,
    revenue: revenueResult._sum.totalAmount || 0,
  };
}

module.exports = {
  getSellerProfileByUserId,
  getSellerProfileById,
  updateShop,
  getShopView,
  listSellerProducts,
  getSellerStats,
};