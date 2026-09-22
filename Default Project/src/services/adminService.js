const { prisma } = require("../database/prisma");
const { env } = require("../config/env");

async function getAdminStats() {
  const [
    users,
    buyers,
    sellers,
    pendingApplications,
    products,
    pendingProducts,
    approvedProducts,
    orders,
    revenue,
    categories,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { role: "BUYER" } }),
    prisma.user.count({ where: { role: "SELLER" } }),
    prisma.sellerApplication.count({ where: { status: "PENDING" } }),
    prisma.product.count(),
    prisma.product.count({ where: { status: "PENDING" } }),
    prisma.product.count({ where: { status: "APPROVED" } }),
    prisma.order.count(),
    prisma.order.aggregate({
      where: { status: { not: "CANCELLED" } },
      _sum: { totalAmount: true },
    }),
    prisma.category.count(),
  ]);

  return {
    users,
    buyers,
    sellers,
    pendingApplications,
    products,
    pendingProducts,
    approvedProducts,
    orders,
    revenue: revenue._sum.totalAmount || 0,
    categories,
  };
}

async function listUsersForAdmin({ page = 0, perPage = 5 } = {}) {
  const where = {};
  const [total, rows] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { sellerProfile: true, _count: { select: { orders: true } } },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function listAllSellers({ page = 0, perPage = 5, status = null } = {}) {
  const where = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.sellerProfile.count({ where }),
    prisma.sellerProfile.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: {
        user: true,
        _count: { select: { products: true, orders: true } },
      },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

module.exports = { getAdminStats, listUsersForAdmin, listAllSellers };