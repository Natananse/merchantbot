const { prisma } = require("../database/prisma");
const userService = require("./userService");
const { logError } = require("../utils/logger");
const { env } = require("../config/env");

let bot = null;

function setBot(instance) {
  bot = instance;
}

async function sendByTelegramId(telegramId, text, extra = {}) {
  if (!bot) return false;
  try {
    await bot.telegram.sendMessage(telegramId, text, {
      parse_mode: "HTML",
      link_preview_options: { is_disabled: true },
      ...extra,
    });
    return true;
  } catch (err) {
    // E.g. user blocked the bot — never crash because of a notification.
    logError("NOTIFY", { telegramId: String(telegramId), error: err.message });
    return false;
  }
}

async function notifyUser(userId, text, extra = {}) {
  const telegramId = await userService.getTelegramId(userId);
  if (telegramId === null) return false;
  return sendByTelegramId(telegramId, text, extra);
}

async function notifySellers(sellerProfileIds, text, extra = {}) {
  const sellers = await prisma.sellerProfile.findMany({
    where: { id: { in: sellerProfileIds } },
    include: { user: true },
  });
  let sent = 0;
  for (const seller of sellers) {
    const ok = await sendByTelegramId(seller.user.telegramId, text, extra);
    if (ok) sent += 1;
  }
  return sent;
}

async function notifyAdmin(text, extra = {}) {
  let sent = 0;
  for (const id of env.ADMIN_TELEGRAM_IDS) {
    const ok = await sendByTelegramId(id, text, extra);
    if (ok) sent += 1;
  }
  return sent;
}

module.exports = { setBot, sendByTelegramId, notifyUser, notifySellers, notifyAdmin };