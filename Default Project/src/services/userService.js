const { prisma } = require("../database/prisma");
const { env } = require("../config/env");

function toBigInt(id) {
  return typeof id === "bigint" ? id : BigInt(id);
}

function isAdminTelegramId(telegramId) {
  return env.ADMIN_TELEGRAM_IDS.includes(toBigInt(telegramId));
}

function baseInclude() {
  return { sellerProfile: true };
}

async function findByTelegramId(telegramId) {
  return prisma.user.findUnique({
    where: { telegramId: toBigInt(telegramId) },
    include: baseInclude(),
  });
}

// Creates the user if they don't exist. Admins are detected from the
// ADMIN_TELEGRAM_ID env list (never from Telegram callback data).
async function ensureUser(from) {
  const telegramId = toBigInt(from.id);
  let user = await findByTelegramId(telegramId);
  if (user) {
    return user;
  }
  const role = isAdminTelegramId(telegramId) ? "ADMIN" : "BUYER";
  user = await prisma.user.create({
    data: {
      telegramId,
      username: from.username || null,
      firstName: from.first_name || "User",
      lastName: from.last_name || null,
      role,
    },
    include: baseInclude(),
  });
  return user;
}

async function getUserById(id) {
  return prisma.user.findUnique({ where: { id }, include: baseInclude() });
}

async function getTelegramId(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramId: true },
  });
  return user ? user.telegramId : null;
}

async function updateUser(userId, data) {
  return prisma.user.update({ where: { id: userId }, data });
}

async function listUsers({ page = 0, perPage = env.PAGE_SIZE } = {}) {
  const [total, rows] = await Promise.all([
    prisma.user.count(),
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { sellerProfile: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function searchUsersByTelegramIdList(telegramIds) {
  if (!telegramIds.length) return [];
  return prisma.user.findMany({
    where: { telegramId: { in: telegramIds.map(toBigInt) } },
    include: { sellerProfile: true },
  });
}

module.exports = {
  toBigInt,
  isAdminTelegramId,
  findByTelegramId,
  ensureUser,
  getUserById,
  getTelegramId,
  updateUser,
  listUsers,
  searchUsersByTelegramIdList,
};