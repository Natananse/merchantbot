const { requireAdmin } = require("./auth");
const { ForbiddenError } = require("../utils/errors");

// Async middleware that ensures the caller is an admin from the database
// (not from Telegram callback data). Throws ForbiddenError otherwise.
async function adminOnly(ctx, next) {
  await requireAdmin(ctx);
  await next();
}

module.exports = { adminOnly, ForbiddenError };