const {
  escapeHtml,
  formatPrice,
  orderLabel,
  statusIcon,
  productStatusLabel,
  formatNumber,
} = require("./formatters");

function productCardText(product) {
  const lines = [
    `<b>${escapeHtml(product.name)}</b>`,
    product.description ? escapeHtml(product.description) : null,
    ``,
    `💰 Price: <b>${formatPrice(product.price, product.currency)}</b>`,
    `📦 Stock: ${product.stock}`,
    `🏪 Shop: ${escapeHtml(product.seller?.shopName || "Unknown")}`,
    `📂 Category: ${escapeHtml(product.category?.name || "-")}`,
    product.location ? `📍 ${escapeHtml(product.location)}` : null,
  ].filter((line) => line !== null && line !== "");
  return lines.join("\n");
}

function shopCardText(shopView) {
  const { seller, productCount } = shopView;
  const lines = [
    `🏪 <b>${escapeHtml(seller.shopName)}</b>`,
    seller.description ? escapeHtml(seller.description) : null,
    ``,
    seller.phone ? `📞 ${escapeHtml(seller.phone)}` : null,
    seller.location ? `📍 ${escapeHtml(seller.location)}` : null,
    ``,
    `📦 Products: ${productCount}`,
    `⭐ Rating: ${formatNumber(seller.rating)} / 5`,
    `🗓 Joined: ${seller.createdAt.toISOString().slice(0, 10)}`,
  ].filter((l) => l !== null && l !== "");
  return lines.join("\n");
}

function cartText(detail) {
  const lines = ["<b>🛍 Your Cart</b>", ""];
  if (detail.sellers.length === 0) {
    return "<b>🛍 Your Cart</b>\n\nYour cart is empty.";
  }
  for (const seller of detail.sellers) {
    lines.push(`🏪 ${escapeHtml(seller.sellerName)}`);
    for (const item of seller.items) {
      lines.push(
        `${escapeHtml(item.product.name)}\n` +
          `${formatPrice(item.product.price, item.product.currency)} × ${item.quantity} = ${formatPrice(
            item.lineTotal,
            item.product.currency
          )}`
      );
    }
    lines.push(
      `Subtotal: <b>${formatPrice(seller.subtotal, seller.currency)}</b>`,
      ""
    );
  }
  lines.push(`<b>Total: ${formatPrice(detail.total, detail.currency)}</b>`);
  return lines.join("\n");
}

function orderCardText(order) {
  const buyer = order.buyer || {};
  const lines = [
    `${statusIcon(order.status)} <b>Order ${orderLabel(order)}</b>`,
    `Status: <b>${order.status}</b>`,
    ``,
    ...order.items.map(
      (item) =>
        `• ${escapeHtml(item.productName)} × ${item.quantity} = ${formatPrice(
          item.subtotal,
          item.currency
        )}`
    ),
    ``,
    `<b>Total: ${formatPrice(order.totalAmount, order.currency)}</b>`,
    ``,
    `👤 ${escapeHtml(buyer.firstName || "-")} ${escapeHtml(buyer.lastName || "")}`.replace(
      /\s+$/,
      ""
    ),
    `📞 ${escapeHtml(order.buyerPhone || "-")}`,
    `📍 ${escapeHtml(order.deliveryLocation || "-")}`,
    order.notes ? `📝 ${escapeHtml(order.notes)}` : null,
    order.createdAt
      ? `🕐 ${order.createdAt.toISOString().slice(0, 16).replace("T", " ")}`
      : null,
  ].filter((l) => l !== null && l !== "");
  return lines.join("\n");
}

function productManageText(product) {
  const lines = [
    `<b>${escapeHtml(product.name)}</b>`,
    product.description ? escapeHtml(product.description) : null,
    ``,
    `💰 ${formatPrice(product.price, product.currency)}`,
    `📦 Stock: ${product.stock}`,
    `📂 Category: ${escapeHtml(product.category?.name || "-")}`,
    ``,
    `Status: ${productStatusLabel(product.status)}`,
    product.rejectionReason
      ? `\nRejection reason: ${escapeHtml(product.rejectionReason)}`
      : null,
  ].filter((l) => l !== null && l !== "");
  return lines.join("\n");
}

function newProductReviewText(data, categoriesById) {
  const cat = categoriesById.get(Number(data.categoryId));
  return (
    "<b>NEW PRODUCT — confirm?</b>\n\n" +
    `📛 <b>Name:</b> ${escapeHtml(data.name)}\n` +
    `📝 <b>Description:</b> ${data.description ? escapeHtml(data.description) : "-"}\n` +
    `📂 <b>Category:</b> ${escapeHtml(cat ? cat.name : data.categoryId)}\n` +
    `💰 <b>Price:</b> ${formatPrice(data.price, data.currency)}\n` +
    `📦 <b>Stock:</b> ${data.stock}\n` +
    (data.images && data.images.length
      ? `🖼 <b>Images:</b> ${data.images.length}\n`
      : "") +
    (data.location ? `📍 <b>Location:</b> ${escapeHtml(data.location)}\n` : "") +
    (data.deliveryInfo
      ? `🚚 <b>Delivery:</b> ${escapeHtml(data.deliveryInfo)}\n`
      : "")
  );
}

module.exports = {
  productCardText,
  shopCardText,
  cartText,
  orderCardText,
  productManageText,
  newProductReviewText,
};