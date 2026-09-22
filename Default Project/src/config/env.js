require("dotenv").config();

function parseIntEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === "") return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isNaN(value) ? fallback : value;
}

const env = {
  NODE_ENV: process.env.NODE_ENV || "development",
  BOT_TOKEN: (process.env.BOT_TOKEN || "").trim(),
  ADMIN_TELEGRAM_IDS: (process.env.ADMIN_TELEGRAM_ID || "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => /^\d+$/.test(id)) // ignore placeholders/non-numeric
    .map((id) => BigInt(id)),
  PORT: parseIntEnv("PORT", 3000),
  WEBHOOK_DOMAIN: (process.env.WEBHOOK_DOMAIN || "").trim().replace(/\/+$/, ""),
  DATABASE_URL: process.env.DATABASE_URL || "file:./dev.db",
  CURRENCY: (process.env.CURRENCY || "ETB").trim().toUpperCase(),
  LOW_STOCK_THRESHOLD: parseIntEnv("LOW_STOCK_THRESHOLD", 3),
  PAGE_SIZE: parseIntEnv("PAGE_SIZE", 5),
  webhookMode: false,
};

env.webhookMode = env.WEBHOOK_DOMAIN.length > 0 && env.BOT_TOKEN.length > 0;

module.exports = { env };