const { prisma } = require("../database/prisma");
const { env } = require("../config/env");
const {
  requiredText,
  optionalText,
  positiveNumber,
  nonNegativeInteger,
} = require("../utils/validation");
const {
  NotFoundError,
  ForbiddenError,
  BusinessRuleError,
} = require("../utils/errors");
const auditService = require("./auditService");
const sellerService = require("./sellerService");
const categoryService = require("./categoryService");

const PRODUCT_INCLUDE = {
  images: { orderBy: { sortOrder: "asc" } },
  category: true,
  seller: { include: { user: true } },
};

// Marketplace filter used by the buyer side.
function marketplaceWhere(extra = {}) {
  return {
    ...extra,
    status: "APPROVED",
    seller: { approved: true, status: "ACTIVE" },
  };
}

async function getProductById(id, { includeHidden = false } = {}) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

// Buyer-facing lookup — hidden/not-approved/suspended products are invisible.
async function getMarketProduct(id) {
  const product = await prisma.product.findFirst({
    where: marketplaceWhere({ id }),
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw new NotFoundError("Product not found or not available.");
  return product;
}

async function listMarketProducts({ page = 0, perPage = env.PAGE_SIZE } = {}) {
  const where = marketplaceWhere();
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: PRODUCT_INCLUDE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function listProductsByCategory(categoryId, { page = 0, perPage = env.PAGE_SIZE } = {}) {
  const where = marketplaceWhere({ categoryId });
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: PRODUCT_INCLUDE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

// Search across name, description, category name and shop name.
// Only approved products from active approved sellers are ever returned.
async function searchProducts(query, { page = 0, perPage = env.PAGE_SIZE } = {}) {
  const q = (query || "").trim();
  if (!q) {
    return { total: 0, rows: [], page: 0, pages: 1, query: q };
  }
  const where = marketplaceWhere({
    OR: [
      { name: { contains: q } },
      { description: { contains: q } },
      { category: { name: { contains: q } } },
      { seller: { shopName: { contains: q } } },
    ],
  });
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: PRODUCT_INCLUDE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

// Ownership is ALWAYS resolved from the authenticated seller profile in the DB.
async function getSellerProduct(sellerProfileId, productId) {
  const product = await prisma.product.findFirst({
    where: { id: productId, sellerId: sellerProfileId },
    include: PRODUCT_INCLUDE,
  });
  if (!product) throw new NotFoundError("Product not found.");
  return product;
}

async function assertOwnership(sellerProfileId, productId) {
  await getSellerProduct(sellerProfileId, productId);
}

async function requireApprovedSeller(userId) {
  const seller = await sellerService.getSellerProfileByUserId(userId);
  if (!seller || !seller.approved) {
    throw new BusinessRuleError(
      "Your application is still pending or was rejected. Only approved sellers can publish products."
    );
  }
  if (seller.status === "SUSPENDED") {
    throw new BusinessRuleError("Your seller account is suspended.");
  }
  return seller;
}

// Full backend validation on every field, then create as PENDING.
async function createProduct({
  userId,
  sellerId,
  name,
  description,
  categoryId,
  price,
  currency,
  stock,
  imageUrl,
  images = [],
  location,
  deliveryInfo,
}) {
  await requireApprovedSeller(userId);
  const cleanName = requiredText(name, "Name");
  const cleanDesc = optionalText(description);
  await categoryService.getCategoryById(categoryId); // ensures category exists
  const cleanPrice = positiveNumber(price, "Price");
  const cleanStock = nonNegativeInteger(stock, "Stock");
  const cleanCurrency = (currency || env.CURRENCY).trim().toUpperCase().slice(0, 8);

  const product = await prisma.$transaction(async (tx) => {
    const created = await tx.product.create({
      data: {
        sellerId,
        categoryId,
        name: cleanName,
        description: cleanDesc,
        price: cleanPrice,
        currency: cleanCurrency,
        stock: cleanStock,
        status: "PENDING",
        imageUrl: imageUrl || null,
        location: optionalText(location),
        deliveryInfo: optionalText(deliveryInfo),
      },
    });
    if (images.length > 0) {
      await tx.productImage.createMany({
        data: images.map((fileId, i) => ({
          productId: created.id,
          telegramFileId: fileId,
          sortOrder: i,
        })),
      });
    }
    return created;
  });
  await auditService.log({
    userId,
    action: "PRODUCT_CREATED",
    entityType: "Product",
    entityId: product.id,
    metadata: { name: cleanName, status: "PENDING" },
  });
  return getProductById(product.id);
}

async function updateProduct(userId, sellerId, productId, data) {
  await requireApprovedSeller(userId);
  await assertOwnership(sellerId, productId);
  const cleanup = {};
  if (data.name !== undefined) cleanup.name = requiredText(data.name, "Name");
  if (data.description !== undefined)
    cleanup.description = optionalText(data.description, { max: 1500 });
  if (data.price !== undefined) cleanup.price = positiveNumber(data.price, "Price");
  if (data.currency !== undefined)
    cleanup.currency = (data.currency || env.CURRENCY).trim().toUpperCase().slice(0, 8);
  if (data.stock !== undefined) cleanup.stock = nonNegativeInteger(data.stock, "Stock");
  if (data.imageUrl !== undefined) cleanup.imageUrl = optionalText(data.imageUrl);

  // Recompute status when stock hits zero.
  if (cleanup.stock !== undefined) {
    const current = await prisma.product.findUnique({ where: { id: productId } });
    const newStock = cleanup.stock;
    if (newStock === 0 && current.status === "APPROVED") {
      cleanup.status = "SOLD_OUT";
    } else if (newStock > 0 && current.status === "SOLD_OUT") {
      cleanup.status = "APPROVED";
    }
  }

  await prisma.product.update({ where: { id: productId }, data: cleanup });
  return getProductById(productId);
}

async function setImages(userId, sellerId, productId, imageFileIds, imageUrl = null) {
  await requireApprovedSeller(userId);
  await assertOwnership(sellerId, productId);
  return prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId } });
    if (imageFileIds.length > 0) {
      await tx.productImage.createMany({
        data: imageFileIds.map((fileId, i) => ({
          productId,
          telegramFileId: fileId,
          sortOrder: i,
        })),
      });
    }
    await tx.product.update({
      where: { id: productId },
      data: { imageUrl: imageUrl || null },
    });
  });
}

// Soft delete — product is hidden but the history record stays untouched.
async function deactivateProduct(userId, sellerId, productId) {
  await requireApprovedSeller(userId);
  await assertOwnership(sellerId, productId);
  const product = await prisma.product.update({
    where: { id: productId },
    data: { status: "INACTIVE" },
  });
  await auditService.log({
    userId,
    action: "PRODUCT_DEACTIVATED",
    entityType: "Product",
    entityId: productId,
  });
  return product;
}

async function toggleActive(userId, sellerId, productId) {
  const product = await getSellerProduct(sellerId, productId);
  const next =
    product.status === "INACTIVE" && product.stock > 0 ? "APPROVED" : "INACTIVE";
  if (next === "APPROVED" && product.stock === 0) {
    throw new BusinessRuleError("Cannot activate a product with 0 stock.");
  }
  await assertOwnership(sellerId, productId);
  return prisma.product.update({ where: { id: productId }, data: { status: next } });
}

// ---- Moderation (admin) ------------------------------------------------

async function listProductsByStatus(status, { page = 0, perPage = env.PAGE_SIZE } = {}) {
  const where = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: PRODUCT_INCLUDE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function moderateProduct(id, newStatus, rejectionReason = null, adminUserId) {
  const current = await getProductById(id);
  const product = await prisma.product.update({
    where: { id },
    data: { status: newStatus, rejectionReason },
    include: PRODUCT_INCLUDE,
  });
  await auditService.log({
    userId: adminUserId,
    action: `PRODUCT_${newStatus}`,
    entityType: "Product",
    entityId: id,
    metadata: { previous: current.status, rejectionReason },
  });
  return product;
}

async function getPendingProducts() {
  return prisma.product.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "asc" },
    include: PRODUCT_INCLUDE,
  });
}

async function listSellerProductsForDashboard(sellerProfileId, { page = 0, perPage = 5 } = {}) {
  const where = { sellerId: sellerProfileId };
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: PRODUCT_INCLUDE,
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

module.exports = {
  PRODUCT_INCLUDE,
  marketplaceWhere,
  getProductById,
  getMarketProduct,
  listMarketProducts,
  listProductsByCategory,
  searchProducts,
  getSellerProduct,
  assertOwnership,
  requireApprovedSeller,
  createProduct,
  updateProduct,
  setImages,
  deactivateProduct,
  toggleActive,
  listProductsByStatus,
  moderateProduct,
  getPendingProducts,
  listSellerProductsForDashboard,
};