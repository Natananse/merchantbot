const { PrismaClient } = require("@prisma/client");

// Single shared Prisma client for the whole app.
const prisma = new PrismaClient();

async function disconnect() {
  try {
    await prisma.$disconnect();
  } catch (err) {
    // ignore
  }
}

process.on("SIGINT", disconnect);
process.on("SIGTERM", disconnect);

module.exports = { prisma, disconnect };