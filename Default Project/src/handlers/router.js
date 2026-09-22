const buyerCtl = require("./buyer");
const cartCtl = require("./cart");
const orderCtl = require("./order");
const profileCtl = require("./profile");
const sellerCtl = require("./seller");
const productCtl = require("./product");
const adminCtl = require("./admin");
const startCtl = require("./start");
const { requireSeller, requireAdmin } = require("../middleware/auth");
const { logError } = require("../utils/logger");

// Wrappers ---------------------------------------------------------------

function asSeller(fn) {
  return async (ctx) => {
    await requireSeller(ctx);
    await fn(ctx);
  };
}

function asAdmin(fn) {
  return async (ctx) => {
    await requireAdmin(ctx);
    await fn(ctx);
  };
}

function num(m, i) {
  return Number(m[i]);
}

// Registration helper -------------------------------------------------------

function reg(bot, pattern, handler) {
  const re = pattern instanceof RegExp ? pattern : new RegExp(`^${pattern}$`);
  bot.action(re, async (ctx) => {
    try {
      await ctx.answerCbQuery().catch(() => {});
      ctx.cbHandled = true;
      await handler(ctx);
    } catch (err) {
      logError("CB_HANDLER", {
        data: ctx.callbackQuery ? ctx.callbackQuery.data : "?",
        error: err.message,
        stack: err.stack ? err.stack.split("\n").slice(0, 3).join(" | ") : "",
      });
      try {
        if (err && err.showToUser === true) await ctx.reply(err.message, { parse_mode: "HTML" });
        else await ctx.reply("⚠️ Something went wrong. Please try again.");
      } catch (_) {
        // ignore
      }
    }
  });
}

function registerActions(bot) {
  // Exact actions ----------------------------------------------------------
  const exact = [
    ["menu", () => startCtl.menuCommand],
    ["cancel", () => startCtl.cancelCommand],
    ["nop", () => async (ctx) => ctx.reply("Nothing extra here.")],
    ["browse", () => (ctx) => buyerCtl.browse(ctx, 0)],
    ["search", () => buyerCtl.startSearch],
    ["cats", () => buyerCtl.showCategories],
    ["cart", () => cartCtl.showCart],
    ["cclear", () => cartCtl.clearCart],
    ["ck", () => cartCtl.startCheckout],
    ["ckreq", () => cartCtl.requestPhone],
    ["ckskip_phone", () => cartCtl.skipPhone],
    ["confirmck", () => cartCtl.confirmCheckout],
    ["orders", () => (ctx) => orderCtl.buyerOrders(ctx, 0)],
    ["profile", () => profileCtl.showProfile],
    ["pfup_phone", () => profileCtl.startUpdatePhone],
    ["pfup_loc", () => profileCtl.startUpdateLocation],
    ["regs", () => sellerCtl.becomeSeller],
    ["app_submit", () => sellerCtl.appSubmit],
    ["delno", () => async () => null],
    ["pd_img_skip", () => productCtl.showReview],
    ["pd_img_done", () => productCtl.showReview],
  ];
  for (const [name, factory] of exact) reg(bot, name, factory());

  // Seller dashboard (all require an approved seller)
  const sellerExact = [
    ["sdash", sellerCtl.dashboard],
    ["addp", productCtl.startAddProduct],
    ["pdpub", productCtl.submitProduct],
    ["myp", (ctx) => productCtl.myProducts(ctx, 0)],
    ["editp", (ctx) => productCtl.myProducts(ctx, 0)],
    ["delp", (ctx) => productCtl.myProducts(ctx, 0)],
    ["sorders", (ctx) => orderCtl.sellerOrders(ctx, 0)],
    ["sstats", sellerCtl.sellerStats],
    ["sprofile", sellerCtl.shopProfile],
    ["sedit", sellerCtl.startEditShop],
    ["eshop_name", (ctx) => sellerCtl.editField(ctx, "shopName")],
    ["eshop_desc", (ctx) => sellerCtl.editField(ctx, "description")],
    ["eshop_phone", (ctx) => sellerCtl.editField(ctx, "phone")],
    ["eshop_loc", (ctx) => sellerCtl.editField(ctx, "location")],
  ];
  for (const [name, fn] of sellerExact) reg(bot, name, asSeller(fn));

  // Admin (all verified against the DB role)
  const adminExact = [
    ["admin", adminCtl.adminPanel],
    ["adstats", adminCtl.adminStatsView],
    ["adcats", adminCtl.adminCategories],
    ["catadd", adminCtl.startCreateCategory],
  ];
  for (const [name, fn] of adminExact) reg(bot, name, asAdmin(fn));

  // Regex routes -----------------------------------------------------------
  reg(bot, "browse:(\\d+)", (ctx) => buyerCtl.browse(ctx, num(ctx.match, 1)));
  reg(bot, "prod:(\\d+)", (ctx) => buyerCtl.viewProduct(ctx, num(ctx.match, 1)));
  reg(bot, "cprod:(\\d+)", (ctx) => buyerCtl.viewCategoryProduct(ctx, num(ctx.match, 1)));
  reg(bot, "sprod:(\\d+)", (ctx) => buyerCtl.viewSearchProduct(ctx, num(ctx.match, 1)));
  reg(bot, "srch:(\\d+)", (ctx) => buyerCtl.searchPage(ctx, num(ctx.match, 1)));
  reg(bot, "cat:(\\d+)", (ctx) => buyerCtl.categoryPage(ctx, num(ctx.match, 1), 0));
  reg(bot, "catp:(\\d+):(\\d+)", (ctx) => buyerCtl.categoryPage(ctx, num(ctx.match, 1), num(ctx.match, 2)));
  reg(bot, "add:(\\d+)", (ctx) => buyerCtl.quickAdd(ctx, num(ctx.match, 1)));
  reg(bot, "buynow:(\\d+)", (ctx) => buyerCtl.buyNow(ctx, num(ctx.match, 1)));
  reg(bot, "sshop:(\\d+)", (ctx) => buyerCtl.viewShop(ctx, num(ctx.match, 1)));

  reg(bot, "cplus:(\\d+)", (ctx) => cartCtl.cartPlus(ctx, num(ctx.match, 1)));
  reg(bot, "cminus:(\\d+)", (ctx) => cartCtl.cartMinus(ctx, num(ctx.match, 1)));
  reg(bot, "crmv:(\\d+)", (ctx) => cartCtl.cartRemove(ctx, num(ctx.match, 1)));

  reg(bot, "orders:(\\d+)", (ctx) => orderCtl.buyerOrders(ctx, num(ctx.match, 1)));
  reg(bot, "ordv:(\\d+)", (ctx) => orderCtl.buyerOrderView(ctx, num(ctx.match, 1)));
  reg(bot, "bcancel:(\\d+)", (ctx) => orderCtl.buyerCancelOrder(ctx, num(ctx.match, 1)));
  reg(bot, "sorders:(\\d+)", asSeller((ctx) => orderCtl.sellerOrders(ctx, num(ctx.match, 1))));
  reg(bot, "sordview:(\\d+)", asSeller((ctx) => orderCtl.sellerOrderView(ctx, num(ctx.match, 1))));
  reg(bot, "ost:(\\d+):([A-Z]+)", asSeller((ctx) => orderCtl.sellerStatusUpdate(ctx, num(ctx.match, 1), String(ctx.match[2]))));

  reg(bot, "myp:(\\d+)", asSeller((ctx) => productCtl.myProducts(ctx, num(ctx.match, 1))));
  reg(bot, "spm:(\\d+)", asSeller((ctx) => productCtl.showSellerProductManage(ctx, num(ctx.match, 1))));
  reg(bot, "editp:(\\d+)", asSeller((ctx) => productCtl.editProductMenu(ctx, num(ctx.match, 1))));
  reg(bot, "fname:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "name", num(ctx.match, 1))));
  reg(bot, "fdesc:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "description", num(ctx.match, 1))));
  reg(bot, "fprice:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "price", num(ctx.match, 1))));
  reg(bot, "fcur:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "currency", num(ctx.match, 1))));
  reg(bot, "fstock:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "stock", num(ctx.match, 1))));
  reg(bot, "fimg:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "image", num(ctx.match, 1))));
  reg(bot, "floc:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "location", num(ctx.match, 1))));
  reg(bot, "fdeliv:(\\d+)", asSeller((ctx) => productCtl.startEditField(ctx, "deliveryInfo", num(ctx.match, 1))));
  reg(bot, "tog:(\\d+)", asSeller((ctx) => productCtl.toggleProduct(ctx, num(ctx.match, 1))));
  reg(bot, "delp:(\\d+)", asSeller((ctx) => productCtl.confirmDeleteProduct(ctx, num(ctx.match, 1))));
  reg(bot, "delyes:(\\d+)", asSeller((ctx) => productCtl.deleteProduct(ctx, num(ctx.match, 1))));
  reg(bot, "pd_cat:(\\d+)", (ctx) => productCtl.pickCategory(ctx, num(ctx.match, 1)));
  reg(bot, "pd_catp:(\\d+)", (ctx) => productCtl.showCategoryPicker(ctx, num(ctx.match, 1)));
  reg(bot, "pd_cur:(\\w+)", (ctx) => productCtl.chooseCurrency(ctx, String(ctx.match[1])));

  // Admin regex routes
  reg(bot, "adusers:(\\d+)", asAdmin((ctx) => adminCtl.adminUsers(ctx, num(ctx.match, 1))));
  reg(bot, "adapps:(\\d+)", asAdmin((ctx) => adminCtl.adminApplications(ctx, num(ctx.match, 1))));
  reg(bot, "adpends:(\\d+)", asAdmin((ctx) => adminCtl.adminPendingProducts(ctx, num(ctx.match, 1))));
  reg(bot, "adpv:(\\d+)", asAdmin((ctx) => adminCtl.adminProductView(ctx, num(ctx.match, 1))));
  reg(bot, "apdp:(\\d+)", asAdmin((ctx) => adminCtl.approveProduct(ctx, num(ctx.match, 1))));
  reg(bot, "arjpd:(\\d+)", asAdmin((ctx) => adminCtl.startRejectProduct(ctx, num(ctx.match, 1))));
  reg(bot, "adm_hide:(\\d+)", asAdmin((ctx) => adminCtl.adminHideProduct(ctx, num(ctx.match, 1))));
  reg(bot, "adm_show:(\\d+)", asAdmin((ctx) => adminCtl.adminActivateProduct(ctx, num(ctx.match, 1))));
  reg(bot, "appv:(\\d+)", asAdmin((ctx) => adminCtl.adminApplicationView(ctx, num(ctx.match, 1))));
  reg(bot, "app_ap:(\\d+)", asAdmin((ctx) => adminCtl.approveApplication(ctx, num(ctx.match, 1))));
  reg(bot, "app_rj:(\\d+)", asAdmin((ctx) => adminCtl.startRejectApplication(ctx, num(ctx.match, 1))));
  reg(bot, "adprod:(\\d+)", asAdmin((ctx) => adminCtl.adminAllProducts(ctx, num(ctx.match, 1))));
  reg(bot, "adords:(\\d+)", asAdmin((ctx) => adminCtl.adminOrders(ctx, num(ctx.match, 1))));
  reg(bot, "adov:(\\d+)", asAdmin((ctx) => adminCtl.adminOrderView(ctx, num(ctx.match, 1))));
  reg(bot, "adocancel:(\\d+)", asAdmin((ctx) => adminCtl.adminCancelOrder(ctx, num(ctx.match, 1))));
  reg(bot, "adsellers:(\\d+)", asAdmin((ctx) => adminCtl.adminSellers(ctx, num(ctx.match, 1))));
  reg(bot, "susc:(\\d+)", asAdmin((ctx) => adminCtl.suspendSeller(ctx, num(ctx.match, 1))));
  reg(bot, "actv:(\\d+)", asAdmin((ctx) => adminCtl.activateSeller(ctx, num(ctx.match, 1))));
  reg(bot, "catdel:(\\d+)", asAdmin((ctx) => adminCtl.deleteCategory(ctx, num(ctx.match, 1))));

  // Fallback for any unmapped callback (dead-button guard).
  bot.on("callback_query", async (ctx) => {
    if (ctx.cbHandled) return;
    try {
      await ctx.answerCbQuery("Unknown button.");
    } catch (_) {
      // ignore
    }
  });
}

module.exports = { registerActions };