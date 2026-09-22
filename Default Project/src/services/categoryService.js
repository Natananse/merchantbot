const { prisma } = require("../database/prisma");
const { env } = require("../config/env");
const { requiredText } = require("../utils/validation");
const { NotFoundError } = require("../utils/errors");

async function listCategories() {
  return prisma.category.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { products: true } } },
  });
}

async function getCategoryById(id) {
  const category = await prisma.category.findUnique({ where: { id } });
  if (!category) throw new NotFoundError("Category not found.");
  return category;
}

async function createCategory(name, description = null) {
  const clean = requiredText(name, "Category name");
  return prisma.category.create({
    data: { name: clean, description: description || null },
  });
}

// Soft-restrict: refuse to delete a category that still has products,
// so product data integrity is never broken.
async function deleteCategory(id) {
  const category = await getCategoryById(id);
  const count = await prisma.product.count({ where: { categoryId: id } });
  if (count > 0) {
    throw new NotFoundError(
      `Cannot delete "${category.name}" — ${count} product(s) still use it.`
    );
  }
  await prisma.category.delete({ where: { id } });
  return category;
}

async function listCategoryProducts(
  categoryId,
  { page = 0, perPage = env.PAGE_SIZE } = {}
) {
  const where = _marketplaceWhere({ categoryId });
  const [total, rows] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { images: { orderBy: { sortOrder: "asc" }, take: 1 } },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

// Shared marketplace filter: only APPROVED products from ACTIVE approved sellers.
function _marketplaceWhere(extra = {}) {
  return {
    ...extra,
    status: "APPROVED",
    seller: { approved: true, status: "ACTIVE" },
  };
}

module.exports = {
  listCategories,
  getCategoryById,
  createCategory,
  deleteCategory,
  listCategoryProducts,
};