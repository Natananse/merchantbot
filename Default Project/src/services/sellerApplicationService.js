const { prisma } = require("../database/prisma");
const { NotFoundError, BusinessRuleError } = require("../utils/errors");
const auditService = require("./auditService");

async function getApplicationByUser(userId) {
  return prisma.sellerApplication.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

async function createApplication({ userId, shopName, description, phone, location }) {
  if ((await getApplicationByUser(userId))?.status === "PENDING") {
    throw new BusinessRuleError(
      "You already have a pending application. Please wait for the admin to review it."
    );
  }
  const application = await prisma.sellerApplication.create({
    data: { userId, shopName, description, phone, location },
  });
  await auditService.log({
    userId,
    action: "SELLER_APPLICATION_SUBMITTED",
    entityType: "SellerApplication",
    entityId: application.id,
    metadata: { shopName },
  });
  return application;
}

async function listApplications({ page = 0, perPage = 5, status = "PENDING" } = {}) {
  const where = status ? { status } : {};
  const [total, rows] = await Promise.all([
    prisma.sellerApplication.count({ where }),
    prisma.sellerApplication.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: page * perPage,
      take: perPage,
      include: { user: true },
    }),
  ]);
  return { total, rows, page, pages: Math.max(1, Math.ceil(total / perPage)) };
}

async function getApplicationById(id) {
  const application = await prisma.sellerApplication.findUnique({
    where: { id },
    include: { user: true },
  });
  if (!application) throw new NotFoundError("Application not found.");
  return application;
}

// Approve: flags the application APPROVED, creates/updates the SellerProfile
// and promotes the user role to SELLER — atomically.
async function approveApplication(id, adminUserId) {
  const application = await getApplicationById(id);
  return prisma.$transaction(async (tx) => {
    await tx.sellerApplication.update({
      where: { id },
      data: { status: "APPROVED", rejectionReason: null },
    });
    await tx.sellerProfile.upsert({
      where: { userId: application.userId },
      create: {
        userId: application.userId,
        shopName: application.shopName,
        description: application.description,
        phone: application.phone,
        location: application.location,
        approved: true,
        status: "ACTIVE",
      },
      update: {
        shopName: application.shopName,
        description: application.description,
        phone: application.phone,
        location: application.location,
        approved: true,
        status: "ACTIVE",
      },
    });
    await tx.user.update({
      where: { id: application.userId },
      data: { role: "SELLER" },
    });
    await auditService.log({
      userId: adminUserId,
      action: "SELLER_APPROVED",
      entityType: "SellerApplication",
      entityId: id,
      metadata: { applicantUserId: application.userId },
      client: tx,
    });
    return application;
  });
}

async function rejectApplication(id, reason, adminUserId) {
  const application = await getApplicationById(id);
  return prisma.$transaction(async (tx) => {
    await tx.sellerApplication.update({
      where: { id },
      data: { status: "REJECTED", rejectionReason: reason || null },
    });
    await tx.sellerProfile.updateMany({
      where: { userId: application.userId },
      data: { approved: false, status: "SUSPENDED" },
    });
    await auditService.log({
      userId: adminUserId,
      action: "SELLER_REJECTED",
      entityType: "SellerApplication",
      entityId: id,
      metadata: { applicantUserId: application.userId, reason },
      client: tx,
    });
    return application;
  });
}

// Admin can suspend/activate an existing seller account at any time.
async function setSellerSuspended(sellerProfileId, suspended, adminUserId) {
  return prisma.$transaction(async (tx) => {
    const seller = await tx.sellerProfile.findUnique({
      where: { id: sellerProfileId },
    });
    if (!seller) throw new NotFoundError("Seller not found.");
    await tx.sellerProfile.update({
      where: { id: sellerProfileId },
      data: {
        status: suspended ? "SUSPENDED" : "ACTIVE",
        approved: !suspended,
      },
    });
    await tx.sellerApplication.updateMany({
      where: { userId: seller.userId },
      data: { status: suspended ? "SUSPENDED" : "APPROVED" },
    });
    await auditService.log({
      userId: adminUserId,
      action: suspended ? "SELLER_SUSPENDED" : "SELLER_ACTIVATED",
      entityType: "SellerProfile",
      entityId: sellerProfileId,
      metadata: { sellerUserId: seller.userId },
      client: tx,
    });
    return seller;
  });
}

module.exports = {
  getApplicationByUser,
  createApplication,
  listApplications,
  getApplicationById,
  approveApplication,
  rejectApplication,
  setSellerSuspended,
};