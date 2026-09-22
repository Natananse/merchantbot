const { prisma } = require("../database/prisma");

/**
 * Records an important action for debugging and future administration.
 * Safe to call inside a transaction by passing the tx client as prisma.
 */
async function log({
  userId = null,
  action,
  entityType = null,
  entityId = null,
  metadata = null,
  client = prisma,
}) {
  try {
    await client.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId: entityId === null || entityId === undefined ? null : String(entityId),
        metadata: metadata === null ? null : JSON.stringify(metadata),
      },
    });
  } catch (err) {
    // Audit logging must never break the main flow.
    const { logError } = require("../utils/logger");
    logError("AUDIT_LOG", { action, error: err.message });
  }
}

module.exports = { log };