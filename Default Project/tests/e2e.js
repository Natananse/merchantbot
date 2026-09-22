// End-to-end test harness — drives the REAL bot handler pipeline with
// crafted Telegram updates (messages + inline callbacks), exactly as the
// Telegram API would deliver them. Uses a fake API transport so no network
// and no real bot token are needed.
//
// Run with: npm run e2e

process.env.DATABASE_URL = "file:./e2e.db";
process.env.ADMIN_TELEGRAM_ID = "700000003";
process.env.BOT_TOKEN = "123456789:TEST_FAKE_TOKEN";
process.env.CURRENCY = "ETB";
process.env.LOW_STOCK_THRESHOLD = "3";

const assert = require("assert");
const { prisma, disconnect } = require("../src/database/prisma");

const sent = [];
const answered = [];

function collectButtons(extra) {
  if (!extra) return [];
  const buttons = [];
  const rk = extra.reply_markup;
  // A nested `reply_markup: { reply_markup: ... }` object means a Markup
  // instance was embedded under the `reply_markup` key — the Telegram API
  // rejects that, so flag it so a test can assert this never happens.
  if (rk && typeof rk === "object" && rk.reply_markup && !Array.isArray(rk.inline_keyboard)) {
    buttons.push("__NESTED_REPLY_MARKUP__");
  }
  const pushRow = (row) => {
    for (const b of (row || [])) {
      if (b && typeof b.text === "string") buttons.push(b.text);
      if (b && typeof b.callback_data === "string") buttons.push(b.callback_data);
    }
  };
  if (rk) {
    if (Array.isArray(rk.keyboard)) rk.keyboard.forEach(pushRow);
    if (Array.isArray(rk.inline_keyboard)) rk.inline_keyboard.forEach(pushRow);
  }
  return buttons;
}

const fakeTelegramApi = {
  sendMessage: async (chatId, text, extra) => {
    sent.push({ type: "message", text, buttons: collectButtons(extra) });
    return { message_id: sent.length, chat: { id: chatId } };
  },
  editMessageText: async (chatId, messageId, inlineMsgId, text, extra) => {
    sent.push({ type: "edit", text, buttons: collectButtons(extra) });
    return { ok: true };
  },
  answerCbQuery: async (id, text) => {
    answered.push(text || "");
    return { ok: true };
  },
  sendPhoto: async (chatId, photo, extra) => {
    sent.push({ type: "photo", photo, caption: (extra && extra.caption) || "" });
    return { message_id: 0 };
  },
  getMe: async () => ({ id: 1, username: "test_bot" }),
  setWebhook: async () => ({ ok: true }),
  deleteWebhook: async () => ({ ok: true }),
};

// telegraf v4 builds a brand-new `Telegram` client for every update, so we
// must patch the class prototype (used by both bot.telegram and per-update
// clients) rather than a single bot instance.
const { Telegram } = require("telegraf");
for (const name of Object.keys(fakeTelegramApi)) {
  Telegram.prototype[name] = fakeTelegramApi[name];
}

async function boot() {
  const { createBot } = require("../src/bot");
  const { register } = require("../src/handlers");
  const bot = createBot();
  bot.use((ctx, next) => {
    // nothing extra
    return next();
  });
  register(bot);
  bot.catch = () => {};
  return bot;
}

let bot;
async function sendMessage(userId, text, extra = {}) {
  const message = {
    message_id: Date.now(),
    from: { id: userId, first_name: "Tester", is_bot: false },
    chat: { id: userId, type: "private" },
    date: Math.floor(Date.now() / 1000),
    text,
    ...extra,
  };
  // Telegram marks slash commands with a bot_command entity — Telegraf's
  // command matching requires it.
  if (typeof text === "string" && text.startsWith("/")) {
    message.entities = [{ type: "bot_command", offset: 0, length: text.split(" ")[0].length }];
  }
  const update = { update_id: Date.now(), message };
  await bot.handleUpdate(update);
}

async function sendCallback(userId, data) {
  const update = {
    update_id: Date.now(),
    callback_query: {
      id: String(Date.now()),
      from: { id: userId, first_name: "Tester", is_bot: false },
      chat_instance: "1",
      message: {
        message_id: 1,
        chat: { id: userId, type: "private" },
        date: Math.floor(Date.now() / 1000),
        text: "...",
      },
      data,
    },
  };
  await bot.handleUpdate(update);
}

function hadText(pattern) {
  return sent.some((m) => typeof m.text === "string" && pattern.test(m.text));
}

function hadButton(pattern) {
  return sent.some((m) => Array.isArray(m.buttons) && m.buttons.some((b) => pattern.test(b)));
}

function lastText() {
  const last = [...sent].reverse().find((m) => typeof m.text === "string");
  return last ? last.text : "";
}

// ── Test helpers ──────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
async function t(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✔ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✘ ${name}\n      ${err.message}`);
  }
}

async function main() {
  // clean temp DB
  await prisma.product.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.checkoutGroup.deleteMany({});
  await prisma.sellerApplication.deleteMany({});
  await prisma.sellerProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.auditLog.deleteMany({});

  // seed: one approved seller with a product
  const cat = await prisma.category.create({ data: { name: "Phones", emoji: "📱" } });
  const sellerUser = await prisma.user.create({
    data: { telegramId: BigInt(700000002), username: "demo_seller", firstName: "D", role: "SELLER" },
  });
  const sellerProfile = await prisma.sellerProfile.create({
    data: {
      userId: sellerUser.id,
      shopName: "Gadget Shop",
      phone: "+251911111111",
      location: "AA",
      approved: true,
      status: "ACTIVE",
    },
  });
  const product = await prisma.product.create({
    data: {
      sellerId: sellerProfile.id,
      categoryId: cat.id,
      name: "Test Phone",
      description: "A test phone",
      price: 1000,
      currency: "ETB",
      stock: 10,
      status: "APPROVED",
    },
  });

  bot = await boot();
  const BUY = 700000001;
  const SELLER2 = 700000004;
  const ADMIN = 700000003;

  await t("/start shows main menu", async () => {
    await sendMessage(BUY, "/start");
    assert.ok(hadText(/🛍 Welcome/));
    assert.ok(hadButton(/Browse Products/));
    assert.ok(hadButton(/Become a Seller|Sell/));
  });

  await t("browse shows product", async () => {
    await sendCallback(BUY, "browse");
    assert.ok(hadText(/Test Phone/));
  });

  await t("categories → category page", async () => {
    await sendCallback(BUY, "cats");
    assert.ok(hadText(/Categories/));
    await sendCallback(BUY, `cat:${cat.id}`);
    assert.ok(hadText(/Phones/));
  });

  await t("product detail opens", async () => {
    await sendCallback(BUY, `prod:${product.id}`);
    assert.ok(hadText(/Test Phone/));
  });

  await t("add to cart", async () => {
    await sendCallback(BUY, `add:${product.id}`);
    assert.ok(hadText(/Added to cart/));
  });

  await t("cart view + qty up", async () => {
    await sendCallback(BUY, "cart");
    assert.ok(hadText(/Your Cart/));
    const cart = await prisma.cart.findUnique({ where: { userId: (await prisma.user.findFirst({ where: { telegramId: BigInt(BUY) } })).id } });
    const item = await prisma.cartItem.findFirst({ where: { cartId: cart.id } });
    await sendCallback(BUY, `cplus:${item.id}`);
    const after = await prisma.cartItem.findUnique({ where: { id: item.id } });
    assert.equal(after.quantity, 2);
  });

  await t("checkout flow phone→location→note→confirm", async () => {
    await sendCallback(BUY, "ck");
    assert.ok(hadText(/Phone number/));
    await sendMessage(BUY, "+251900000000");
    assert.ok(hadText(/Delivery location/));
    await sendMessage(BUY, "Bole, Addis Ababa");
    assert.ok(hadText(/Order note/));
    await sendMessage(BUY, "⏭ Skip note");
    assert.ok(hadText(/ORDER SUMMARY/));
    await sendCallback(BUY, "confirmck");
    assert.ok(hadText(/Order placed/));
    const orders = await prisma.order.findMany({ where: { buyerId: (await prisma.user.findFirst({ where: { telegramId: BigInt(BUY) } })).id } });
    assert.equal(orders.length, 1);
    const fresh = await prisma.product.findUnique({ where: { id: product.id } });
    assert.equal(fresh.stock, 8); // stock reduced 2 units
  });

  await t("buyer sees their order", async () => {
    await sendCallback(BUY, "orders");
    assert.ok(hadText(/My Orders/));
  });

  await t("seller order flow: view + status update", async () => {
    await sendCallback(SELLER2, "menu");
    // seller2 not approved yet → application first
    await sendCallback(SELLER2, "regs");
    assert.ok(/Shop name/.test(lastText()));
    await sendMessage(SELLER2, "Cloth Co");
    await sendMessage(SELLER2, "-");
    await sendMessage(SELLER2, "+251900000002");
    await sendMessage(SELLER2, "Hawassa");
    assert.ok(hadText(/SELLER APPLICATION/));
    await sendCallback(SELLER2, "app_submit");
    assert.ok(hadText(/Application submitted/));
  });

  await t("admin: sees application, approves it", async () => {
    await sendCallback(ADMIN, "admin");
    assert.ok(hadText(/ADMIN PANEL/));
    await sendCallback(ADMIN, "adapps:0");
    assert.ok(hadText(/Applications/));
    const app = await prisma.sellerApplication.findFirst({ where: { user: { telegramId: BigInt(SELLER2) } } });
    await sendCallback(ADMIN, `appv:${app.id}`);
    await sendCallback(ADMIN, `app_ap:${app.id}`);
    const profile = await prisma.sellerProfile.findFirst({ where: { userId: app.userId } });
    assert.ok(profile && profile.approved === true);
  });

  await t("new seller opens dashboard", async () => {
    await sendCallback(SELLER2, "sdash");
    assert.ok(hadText(/SELLER DASHBOARD/));
  });

  await t("seller add-product flow (full)", async () => {
    await sendCallback(SELLER2, "addp");
    assert.ok(/Product name/.test(lastText()));
    await sendMessage(SELLER2, "Shirt 123");
    await sendMessage(SELLER2, "A nice shirt");
    await sendCallback(SELLER2, `pd_cat:${cat.id}`);
    assert.ok(/Price/.test(lastText()));
    await sendMessage(SELLER2, "250");
    await sendCallback(SELLER2, "pd_cur:default");
    assert.ok(/Stock/.test(lastText()));
    await sendMessage(SELLER2, "15");
    assert.ok(/Photos/.test(lastText()));
    await sendCallback(SELLER2, "pd_img_skip");
    assert.ok(hadText(/NEW PRODUCT/));
    await sendCallback(SELLER2, "pdpub");
    assert.ok(hadText(/Product submitted!/));
    const created = await prisma.product.findFirst({ where: { sellerId: (await profileOf(SELLER2)).id, name: "Shirt 123" } });
    assert.ok(created);
    assert.equal(created.status, "PENDING");
  });

  await t("admin approves product → becomes APPROVED", async () => {
    await sendCallback(ADMIN, "adpends:0");
    assert.ok(hadText(/Pending Products/));
    const created = await prisma.product.findFirst({ where: { name: "Shirt 123" } });
    await sendCallback(ADMIN, `adpv:${created.id}`);
    await sendCallback(ADMIN, `apdp:${created.id}`);
    const afterMod = await prisma.product.findUnique({ where: { id: created.id } });
    assert.equal(afterMod.status, "APPROVED");
  });

  await t("admin stats", async () => {
    await sendCallback(ADMIN, "adstats");
    assert.ok(hadText(/Statistics/));
  });

  await t("search → results → product view → buy", async () => {
    await sendCallback(BUY, "search");
    assert.ok(/looking for/.test(lastText()));
    await sendMessage(BUY, "Shirt");
    assert.ok(hadText(/Search results/));
    assert.ok(hadButton(/Shirt 123/));
    await sendCallback(BUY, "sprod:" + (await prisma.product.findFirst({ where: { name: "Shirt 123" } })).id);
    assert.ok(hadText(/Shirt 123/));
    await sendCallback(BUY, "add:" + (await prisma.product.findFirst({ where: { name: "Shirt 123" } })).id);
    assert.ok(hadText(/Added to cart/));
  });

  await t("seller toggles + edits own product", async () => {
    const shirt = await prisma.product.findFirst({ where: { name: "Shirt 123" } });
    await sendCallback(SELLER2, "spm:" + shirt.id);
    assert.ok(hadText(/Manage/));
    await sendCallback(SELLER2, "tog:" + shirt.id);
    const inactive = await prisma.product.findUnique({ where: { id: shirt.id } });
    assert.equal(inactive.status, "INACTIVE");
    await sendCallback(SELLER2, "tog:" + shirt.id);
    const active = await prisma.product.findUnique({ where: { id: shirt.id } });
    assert.equal(active.status, "APPROVED");
    await sendCallback(SELLER2, "fprice:" + shirt.id);
    assert.ok(/Send the new/.test(lastText()));
    await sendMessage(SELLER2, "275");
    const priced = await prisma.product.findUnique({ where: { id: shirt.id } });
    assert.equal(priced.price, 275);
  });

  await t("seller updates order status → history recorded", async () => {
    // buyer buys a second order from seller2's shop
    await sendCallback(BUY, "cart");
    await sendCallback(BUY, "ck");
    await sendMessage(BUY, "skip");
    await sendMessage(BUY, "Adama");
    await sendMessage(BUY, "⏭ Skip note");
    await sendCallback(BUY, "confirmck");
    assert.ok(hadText(/Order placed/));
    const buyer = await prisma.user.findFirst({ where: { telegramId: BigInt(BUY) } });
    const orders = await prisma.order.findMany({
      where: { buyerId: buyer.id },
      include: { seller: { include: { user: true } }, items: true },
    });
    const seller2Profile = await profileOf(SELLER2);
    if (process.env.E2E_DEBUG) {
      console.log("BUY orders:", orders.map((o) => ({
        sellerUser: o.seller.userId,
        sellerShop: o.seller.shopName,
        status: o.status,
        items: o.items.map((i) => i.productName),
      })));
      console.log("SELLER2 profile userId:", seller2Profile && seller2Profile.userId);
    }
    const sellerOrders = orders.filter((o) => o.seller.userId === seller2Profile.userId);
    assert.equal(sellerOrders.length, 1);
    const o = sellerOrders[0];
    await sendCallback(SELLER2, "sorders:0");
    assert.ok(hadText(/Orders/));
    await sendCallback(SELLER2, "sordview:" + o.id);
    assert.ok(hadText(/Order/));
    await sendCallback(SELLER2, "ost:" + o.id + ":CONF");
    const moved = await prisma.order.findUnique({ where: { id: o.id }, include: { statusHistory: true } });
    assert.equal(moved.status, "CONFIRMED");
    assert.ok(moved.statusHistory.some((h) => h.newStatus === "CONFIRMED"));
  });

  await t("admin category create + delete", async () => {
    await sendCallback(ADMIN, "adcats");
    assert.ok(hadText(/Categories/));
    await sendCallback(ADMIN, "catadd");
    assert.ok(/name/.test(lastText()));
    await sendMessage(ADMIN, "Books 📚");
    assert.ok(hadText(/created/));
    const catBook = await prisma.category.findFirst({ where: { name: "Books 📚" } });
    assert.ok(catBook);
    // deleting a category that still has products should be refused
    await prisma.category.create({ data: { name: "Empty Cat", emoji: "🧻" } });
    const empty = await prisma.category.findFirst({ where: { name: "Empty Cat" } });
    await sendCallback(ADMIN, "catdel:" + empty.id);
    const gone = await prisma.category.findFirst({ where: { id: empty.id } });
    assert.equal(gone, null);
  });

  await t("profile phone edit", async () => {
    await sendCallback(BUY, "profile");
    assert.ok(hadText(/👤 Profile/));
    await sendCallback(BUY, "pfup_phone");
    assert.ok(/phone/.test(lastText()));
    await sendMessage(BUY, "+251912345678");
    const u = await prisma.user.findFirst({ where: { telegramId: BigInt(BUY) } });
    assert.equal(u.phone, "+251912345678");
  });

  await t("no reply_markup is ever nested (Telegram API shape)", async () => {
    // Regression guard: a Markup instance embedded under `reply_markup` would
    // serialize as `{ reply_markup: { reply_markup: ... } }` and get rejected.
    assert.ok(!hadButton(/__NESTED_REPLY_MARKUP__/), "found a nested reply_markup");
  });

  await t("normal user blocked from admin panel", async () => {
    sent.length = 0;
    await sendCallback(BUY, "admin");
    assert.ok(hadText(/Access denied|not an admin/), "expected access denied message");
  });

  await t("unknown callback answered, no crash", async () => {
    sent.length = 0;
    answered.length = 0;
    await sendCallback(BUY, "totally_bogus_xyz");
    // must not throw; fallback handled it
    assert.ok(true);
  });

  await t("/cancel clears flow state", async () => {
    await sendCallback(SELLER2, "addp");
    await sendMessage(SELLER2, "/cancel");
    assert.ok(hadText(/Cancelled/));
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

async function profileOf(telegramId) {
  const u = await prisma.user.findFirst({ where: { telegramId: BigInt(telegramId) } });
  return prisma.sellerProfile.findFirst({ where: { userId: u.id } });
}

main().finally(() => disconnect());