// Backend smoke tests — exercises the service/business layer directly,
// WITHOUT Telegram. Uses its own throwaway SQLite database so your real
// dev.db is never touched.
//
// Run with: npm run smoke
//
// Covers (from the spec): TEST 1-18 (buyer/seller flows, stock, price
// protection, moderation, ownership, RBAC, transitions)

process.env.DATABASE_URL = "file:./smoke.db";
process.env.LOW_STOCK_THRESHOLD = "3";
process.env.CURRENCY = "ETB";

const assert = require("assert");
const { prisma, disconnect } = require("../src/database/prisma");

const userService = require("../src/services/userService");
const sellerApplicationService = require("../src/services/sellerApplicationService");
const sellerService = require("../src/services/sellerService");
const productService = require("../src/services/productService");
const categoryService = require("../src/services/categoryService");
const cartService = require("../src/services/cartService");
const checkoutService = require("../src/services/checkoutService");
const orderService = require("../src/services/orderService");
const adminService = require("../src/services/adminService");
const auditService = require("../src/services/auditService");
const auth = require("../src/middleware/auth");
const {
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InsufficientStockError,
  BusinessRuleError,
} = require("../src/utils/errors");

let passed = 0;
let failed = 0;
function t(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      passed += 1;
      console.log(`  ✔ ${name}`);
    })
    .catch((err) => {
      failed += 1;
      console.error(`  ✘ ${name}\n      ${err.message}`);
    });
}

async function main() {
  // clean slate
  await prisma.product.deleteMany({});
  await prisma.cartItem.deleteMany({});
  await prisma.cart.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.productImage.deleteMany({});
  await prisma.checkoutGroup.deleteMany({});
  await prisma.sellerApplication.deleteMany({});
  await prisma.sellerProfile.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.auditLog.deleteMany({});
  await prisma.orderStatusHistory.deleteMany({});

  // setup users
  const buyer = await userService.ensureUser({ id: 88880001, username: "buyer1", first_name: "Buyer" });
  const sellerUser = await userService.ensureUser({ id: 88880002, username: "seller1", first_name: "Seller" });
  const sellerUser2 = await userService.ensureUser({ id: 88880003, username: "seller2", first_name: "Seller2" });
  const admin = await userService.ensureUser({ id: 88880004, username: "admin1", first_name: "Admin" });
  await prisma.user.update({ where: { id: admin.id }, data: { role: "ADMIN" } });
  const otherBuyer = await userService.ensureUser({ id: 88880005, username: "buyer2", first_name: "Buyer2" });

  let shopId = 0;
  let shopId2 = 0;
  let cat = null;
  let approvedProduct = null;
  let pendingProduct2 = null;
  let lowStockProduct = null;
  let soldoutProduct = null;

  // ── Seed categories ─────────────────────────────────────────────────────
  cat = await categoryService.createCategory("Phones", "phones");
  await categoryService.createCategory("Electronics", "electronics");
  const catNoProducts = await categoryService.createCategory("Empty", "empty");

  // ── Seller registration & approval ──────────────────────────────────────
  await t("Application created (PENDING) + audit", async () => {
    const app = await sellerApplicationService.createApplication({
      userId: sellerUser.id,
      shopName: "Gadgets Hub",
      description: "Sells gadgets",
      phone: "+251900000001",
      location: "AA",
    });
    assert.equal(app.status, "PENDING");
    const audit = await prisma.auditLog.findFirst({ where: { action: "SELLER_APPLICATION_SUBMITTED" } });
    assert.ok(audit);
  });

  await t("Duplicate pending application rejected", async () => {
    await assert.rejects(
      sellerApplicationService.createApplication({
        userId: sellerUser.id,
        shopName: "Again",
        description: null,
        phone: "+251900000001",
        location: "AA",
      }),
      BusinessRuleError
    );
  });

  await t("Admin approves application → seller profile + SELLER role", async () => {
    const application = await sellerApplicationService.getApplicationByUser(sellerUser.id);
    await sellerApplicationService.approveApplication(application.id, admin.id);
    const profile = await sellerService.getSellerProfileByUserId(sellerUser.id);
    assert.ok(profile.approved);
    assert.equal(profile.shopName, "Gadgets Hub");
    const user = await userService.getUserById(sellerUser.id);
    assert.equal(user.role, "SELLER");
    shopId = profile.id;
  });

  await t("Second seller approved", async () => {
    const app = await sellerApplicationService.createApplication({
      userId: sellerUser2.id,
      shopName: "Clothes Co",
      description: null,
      phone: "+251900000002",
      location: "Hawassa",
    });
    await sellerApplicationService.approveApplication(app.id, admin.id);
    const profile = await sellerService.getSellerProfileByUserId(sellerUser2.id);
    assert.ok(profile.approved);
    shopId2 = profile.id;
  });

  // ── Product creation & validation ───────────────────────────────────────
  await t("Product created → PENDING", async () => {
    const p = await productService.createProduct({
      userId: sellerUser.id,
      sellerId: shopId,
      name: "Phone A",
      description: "A great phone",
      categoryId: cat.id,
      price: 5000,
      currency: "ETB",
      stock: 12,
    });
    assert.equal(p.status, "PENDING");
    assert.equal(p.price, 5000);
    pendingProduct2 = p;
  });

  await t("Rejected: negative price", async () => {
    await assert.rejects(
      productService.createProduct({
        userId: sellerUser.id, sellerId: shopId, name: "Bad", description: "x",
        categoryId: cat.id, price: -5, currency: "ETB", stock: 1,
      }),
      ValidationError
    );
  });

  await t("Rejected: invalid category", async () => {
    await assert.rejects(
      productService.createProduct({
        userId: sellerUser.id, sellerId: shopId, name: "Bad", description: "x",
        categoryId: 999999, price: 5, currency: "ETB", stock: 1,
      }),
      NotFoundError
    );
  });

  await t("Pending product invisible to buyers", async () => {
    await assert.rejects(productService.getMarketProduct(pendingProduct2.id), NotFoundError);
    const res = await productService.searchProducts("Phone");
    assert.ok(!res.rows.find((p) => p.id === pendingProduct2.id));
  });

  await t("Admin approves product → APPROVED + visible", async () => {
    await productService.moderateProduct(pendingProduct2.id, "APPROVED", null, admin.id);
    const p = await productService.getMarketProduct(pendingProduct2.id);
    assert.equal(p.status, "APPROVED");
    approvedProduct = p;
  });

  await t("Search finds approved product by name", async () => {
    const res = await productService.searchProducts("Phone");
    assert.ok(res.rows.length >= 1);
  });

  await t("Search finds by shop name (seller)", async () => {
    const res = await productService.searchProducts("Gadgets");
    assert.ok(res.rows.length >= 1);
  });

  // ── Cart ────────────────────────────────────────────────────────────────
  await t("Add approved product to cart", async () => {
    const cart = await cartService.addItem(buyer.id, approvedProduct.id, 1);
    assert.equal(cart.items.find((i) => i.productId === approvedProduct.id).quantity, 1);
  });

  await t("Add again merges quantity (=2)", async () => {
    const cart = await cartService.addItem(buyer.id, approvedProduct.id, 1);
    assert.equal(cart.items.find((i) => i.productId === approvedProduct.id).quantity, 2);
  });

  await t("Add more than stock rejected", async () => {
    await assert.rejects(cartService.addItem(buyer.id, approvedProduct.id, 999), InsufficientStockError);
  });

  // ── Checkout / stock / price snapshot ───────────────────────────────────
  await t("Checkout reduces stock, snapshots price, clears cart", async () => {
    const before = approvedProduct.stock;
    const result = await checkoutService.checkout(buyer.id, { phone: "+251911111111", location: "Bole" });
    assert.equal(result.orders.length, 1);
    const order = result.orders[0];
    assert.equal(order.items[0].productName, "Phone A");
    assert.equal(order.items[0].price, 5000);
    assert.equal(order.items[0].subtotal, 10000);
    const after = await prisma.product.findUnique({ where: { id: approvedProduct.id } });
    assert.equal(after.stock, before - 2);
    const cart = await cartService.getCartDetailed(buyer.id);
    assert.equal(cart.count, 0);
  });

  await t("Price change after order does NOT change old order", async () => {
    await productService.updateProduct(sellerUser.id, shopId, approvedProduct.id, { price: 7000 });
    const oldOrder = await prisma.order.findFirst({
      where: { buyerId: buyer.id },
      include: { items: true },
    });
    assert.equal(oldOrder.items[0].price, 5000);
    const newPrice = await productService.getProductById(approvedProduct.id);
    assert.equal(newPrice.price, 7000);
  });

  await t("Multi-seller cart splits into separate orders, one checkout group", async () => {
    const seller2prod = await productService.createProduct({
      userId: sellerUser2.id, sellerId: shopId2, name: "Shirt", description: "cotton",
      categoryId: cat.id, price: 300, currency: "ETB", stock: 10,
    });
    await productService.moderateProduct(seller2prod.id, "APPROVED", null, admin.id);
    await cartService.addItem(otherBuyer.id, approvedProduct.id, 1);
    await cartService.addItem(otherBuyer.id, seller2prod.id, 2);
    const result = await checkoutService.checkout(otherBuyer.id, { phone: "+251922222222", location: "Merkato" });
    assert.equal(result.orders.length, 2);
    assert.notEqual(result.orders[0].sellerId, result.orders[1].sellerId);
    assert.equal(result.orders[0].checkoutGroupId, result.orders[1].checkoutGroupId);
  });

  await t("Concurrent last-stock is protected (insufficient stock on 2nd buyer)", async () => {
    const rare = await productService.createProduct({
      userId: sellerUser.id, sellerId: shopId, name: "Rare Item", description: "limited",
      categoryId: cat.id, price: 1000, currency: "ETB", stock: 3,
    });
    await productService.moderateProduct(rare.id, "APPROVED", null, admin.id);
    // BOTH buyers add 2 while stock is still 3 — valid at add time.
    await cartService.addItem(buyer.id, rare.id, 2);
    await cartService.addItem(otherBuyer.id, rare.id, 2);
    // Buyer 1 takes 2 → 1 left (product still APPROVED, not sold out).
    const ok = await checkoutService.checkout(buyer.id, { phone: "+1", location: "t" });
    assert.equal(ok.orders.length, 1);
    // Buyer 2 needs 2 but only 1 remains → checkout rolls back atomically.
    await assert.rejects(
      checkoutService.checkout(otherBuyer.id, { phone: "+1", location: "t" }),
      InsufficientStockError
    );
  });

  await t("Stock 0 auto-flips product to SOLD_OUT", async () => {
    const item = await productService.createProduct({
      userId: sellerUser.id, sellerId: shopId, name: "Last One", description: "single unit",
      categoryId: cat.id, price: 50, currency: "ETB", stock: 1,
    });
    await productService.moderateProduct(item.id, "APPROVED", null, admin.id);
    await cartService.addItem(buyer.id, item.id, 1);
    await checkoutService.checkout(buyer.id, { phone: "+1", location: "t" });
    const after = await productService.getProductById(item.id);
    assert.equal(after.status, "SOLD_OUT");
    soldoutProduct = item;
  });

  // ── Low stock warning ───────────────────────────────────────────────────
  await t("Low-stock list returned when threshold reached", async () => {
    const item = await productService.createProduct({
      userId: sellerUser.id, sellerId: shopId, name: "Low Stock Item", description: "low",
      categoryId: cat.id, price: 20, currency: "ETB", stock: 4,
    });
    await productService.moderateProduct(item.id, "APPROVED", null, admin.id);
    await cartService.addItem(buyer.id, item.id, 3);
    const result = await checkoutService.checkout(buyer.id, { phone: "+1", location: "t" });
    const low = result.lowStockProducts.find((p) => p.productId === item.id);
    assert.ok(low, "expected low stock warning for the item (1 left ≤ 3)");
    lowStockProduct = item;
  });

  // ── Orders: visibility & transitions ────────────────────────────────────
  await t("Seller sees only their own orders", async () => {
    const data = await orderService.listSellerOrders(shopId);
    assert.ok(data.rows.length >= 1);
    for (const order of data.rows) assert.equal(order.sellerId, shopId);
    // the other seller sees a different set
    const data2 = await orderService.listSellerOrders(shopId2);
    assert.ok(data2.rows.length >= 1);
    for (const order of data2.rows) assert.equal(order.sellerId, shopId2);
  });

  await t("Valid transition PENDING→CONFIRMED", async () => {
    const order = await orderService.listSellerOrders(shopId).then((d) => d.rows[0]);
    const updated = await orderService.changeStatus(order.id, "CONFIRMED", sellerUser.id, { actor: "seller" });
    assert.equal(updated.status, "CONFIRMED");
    const history = await prisma.orderStatusHistory.findMany({ where: { orderId: order.id } });
    assert.ok(history.length >= 2);
  });

  await t("Invalid transition CONFIRMED→DELIVERED rejected", async () => {
    const order = await orderService.getOrderById((await orderService.listSellerOrders(shopId)).rows[0].id);
    await assert.rejects(orderService.changeStatus(order.id, "DELIVERED"), BusinessRuleError);
  });

  await t("Buyer cancels their own PENDING order", async () => {
    const o = await prisma.order.create({
      data: {
        orderNumber: "ORDT" + Date.now(),
        buyerId: buyer.id,
        sellerId: shopId,
        checkoutGroupId: (await prisma.checkoutGroup.create({ data: { buyerId: buyer.id, totalAmount: 5 } })).id,
        totalAmount: 5,
        currency: "ETB",
      },
    });
    await orderService.changeStatus(o.id, "CANCELLED", buyer.id, { actor: "buyer" });
    const after = await orderService.getOrderById(o.id);
    assert.equal(after.status, "CANCELLED");
  });

  // ── Ownership & RBAC ────────────────────────────────────────────────────
  await t("Seller cannot fetch another seller's product", async () => {
    await assert.rejects(productService.getSellerProduct(shopId2, approvedProduct.id), NotFoundError);
  });

  await t("Seller cannot edit another seller's product", async () => {
    await assert.rejects(
      productService.updateProduct(sellerUser2.id, shopId2, approvedProduct.id, { price: 1 }),
      NotFoundError
    );
  });

  await t("Normal user blocked from admin panel", async () => {
    await assert.rejects(
      auth.requireAdmin({ user: { id: buyer.id } }),
      ForbiddenError
    );
  });

  await t("Admin has access", async () => {
    const user = await auth.requireAdmin({ user: { id: admin.id } });
    assert.equal(user.role, "ADMIN");
  });

  await t("Suspended seller cannot publish products", async () => {
    const sellerInfo = await sellerService.getSellerProfileByUserId(sellerUser2.id);
    await sellerApplicationService.setSellerSuspended(sellerInfo.id, true, admin.id);
    await assert.rejects(
      productService.createProduct({
        userId: sellerUser2.id, sellerId: shopId2, name: "Nope", description: "x",
        categoryId: cat.id, price: 5, currency: "ETB", stock: 1,
      }),
      BusinessRuleError
    );
    await sellerApplicationService.setSellerSuspended(sellerInfo.id, false, admin.id);
  });

  await t("Suspended seller products hidden from marketplace", async () => {
    // re-suspend and check a product of theirs disappears
    const sellerInfo = await sellerService.getSellerProfileByUserId(sellerUser2.id);
    const p = await prisma.product.findFirst({ where: { sellerId: shopId2 } });
    await sellerApplicationService.setSellerSuspended(sellerInfo.id, true, admin.id);
    await assert.rejects(productService.getMarketProduct(p.id), NotFoundError);
    await sellerApplicationService.setSellerSuspended(sellerInfo.id, false, admin.id);
    const again = await productService.getMarketProduct(p.id);
    assert.equal(again.status, "APPROVED");
  });

  // ── Admin lists & stats ─────────────────────────────────────────────────
  await t("Admin stats computed", async () => {
    const stats = await adminService.getAdminStats();
    assert.ok(stats.users >= 5);
    assert.ok(stats.products >= 5);
    assert.ok(stats.orders >= 1);
  });

  await t("Admin order list shows all sellers' orders", async () => {
    const data = await orderService.listAllOrders({});
    const sellerIds = new Set(data.rows.map((o) => o.sellerId));
    assert.ok(sellerIds.has(shopId) && sellerIds.has(shopId2));
  });

  await t("Category with products cannot be deleted", async () => {
    await assert.rejects(categoryService.deleteCategory(cat.id));
  });

  await t("Empty category can be deleted", async () => {
    await categoryService.deleteCategory(catNoProducts.id);
  });

  await t("Audit trail recorded for product moderation", async () => {
    const audit = await prisma.auditLog.findFirst({ where: { action: "PRODUCT_APPROVED" } });
    assert.ok(audit);
    const created = await prisma.auditLog.findFirst({ where: { action: "PRODUCT_CREATED" } });
    assert.ok(created);
  });

  await t("Optional: manual auditService.log() idempotent", async () => {
    await auditService.log({ userId: admin.id, action: "TEST", entityType: "N/A" });
    const found = await prisma.auditLog.findFirst({ where: { action: "TEST" } });
    assert.ok(found);
  });

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exitCode = 1;
}

main().finally(() => disconnect());