const userService = require("../services/userService");
const sellerService = require("../services/sellerService");
const { ForbiddenError, BusinessRuleError } = require("../utils/errors");

// Attaches ctx.user (created if missing) for every authenticated update.
async function attachUser(ctx, next) {
  if (ctx.from) {
    ctx.user = await userService.ensureUser(ctx.from);
    // Multi-step flows that start on an asSeller-guarded button continue via
    // plain-text / photo replies where the router guard does not re-run, so
    // surface the seller profile here too. requireSeller() remains the
    // authoritative (approved + not suspended) check for guarded routes.
    if (ctx.user && ctx.user.sellerProfile) {
      ctx.seller = ctx.user.sellerProfile;
    }
  }
  await next();
}

// Guards ----------------------------------------------------------------

async function requireUser(ctx) {
  if (!ctx.user) {
    await requireCtxUser(ctx);
  }
  return ctx.user;
}

async function requireCtxUser(ctx) {
  if (ctx.user) return ctx.user;
  if (!ctx.from) throw new ForbiddenError("Start the bot with /start first.");
  ctx.user = await userService.ensureUser(ctx.from);
  return ctx.user;
}

async function requireSeller(ctx) {
  const user = await requireCtxUser(ctx);
  const seller = await sellerService.getSellerProfileByUserId(user.id);
  if (!seller || !seller.approved) {
    throw new BusinessRuleError(
      "You are not an approved seller yet. Send /menu and press 'Become a Seller' to apply."
    );
  }
  if (seller.status === "SUSPENDED") {
    throw new BusinessRuleError("Your seller account has been suspended.");
  }
  ctx.seller = seller;
  return seller;
}

async function requireAdmin(ctx) {
  const user = await requireCtxUser(ctx);
  // Authoritative check against the database role — caller may claim
  // anything in callback data but we only trust the DB role here.
  const dbUser = await userService.getUserById(user.id);
  if (!dbUser || dbUser.role !== "ADMIN") {
    throw new ForbiddenError("Access denied. You are not an admin.");
  }
  return dbUser;
}

module.exports = { attachUser, requireUser, requireSeller, requireAdmin };