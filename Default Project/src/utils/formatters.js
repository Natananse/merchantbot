const { env } = require("../config/env");

function escapeHtml(text) {
  if (text === null || text === undefined) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 123456.789 -> 123,456.79
function formatNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function formatPrice(value, currency) {
  const cur = currency || env.CURRENCY;
  return `${formatNumber(value)} ${cur}`;
}

function orderLabel(order) {
  return `#${String(order.id).padStart(4, "0")}`;
}

function statusIcon(status) {
  const icons = {
    PENDING: "🕐",
    CONFIRMED: "✅",
    PROCESSING: "🔧",
    READY: "📦",
    DELIVERED: "🚚",
    CANCELLED: "❌",
  };
  return icons[status] || "•";
}

function productStatusLabel(status) {
  const labels = {
    PENDING: "🕐 Pending approval",
    APPROVED: "✅ Approved",
    REJECTED: "❌ Rejected",
    SUSPENDED: "🚫 Suspended",
    SOLD_OUT: "Sold out",
    INACTIVE: "Hidden (inactive)",
  };
  return labels[status] || status;
}

function truncate(text, max = 120) {
  const str = text || "";
  return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}

module.exports = {
  escapeHtml,
  formatNumber,
  formatPrice,
  orderLabel,
  statusIcon,
  productStatusLabel,
  truncate,
};