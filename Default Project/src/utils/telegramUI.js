// Small Telegram-UI helpers shared across handlers.
const { mainMenu } = require("../keyboards/main");

const HTML = { parse_mode: "HTML", link_preview_options: { is_disabled: true } };

// Accepts either a Markup instance or a plain `{ inline_keyboard: [...] }`
// object and returns the plain object that must go under `reply_markup`.
function kbData(markup) {
  if (
    markup &&
    typeof markup === "object" &&
    markup.reply_markup &&
    !Array.isArray(markup.inline_keyboard) &&
    !Array.isArray(markup.keyboard) &&
    !Array.isArray(markup.force_reply)
  ) {
    return markup.reply_markup;
  }
  return markup;
}

// Tries to edit the message the user tapped; falls back to sending a new one.
async function editOrSend(ctx, text, markup, opts = {}) {
  if (ctx.callbackQuery && ctx.callbackQuery.message) {
    try {
      await ctx.editMessageText(text, {
        ...HTML,
        reply_markup: kbData(markup),
        ...opts,
      });
      return true;
    } catch (err) {
      const msg = err && err.message ? err.message : "";
      // 400 + "message is not modified" is fine; others fall through to reply.
      const notModified = /not modified|message to edit not found|wrong chat/i.test(msg);
      if (notModified) return true;
    }
  }
  await ctx.reply(text, { ...HTML, reply_markup: kbData(markup), ...opts });
  return false;
}

async function sendProduct(ctx, product, markup, opts = {}) {
  const { productCardText } = require("./render");
  const caption = productCardText(product);
  const firstImage = product.images && product.images[0];
  if (firstImage) {
    await ctx.sendPhoto(firstImage.telegramFileId, {
      caption,
      reply_markup: kbData(markup),
      ...HTML,
      ...opts,
    });
  } else if (product.imageUrl) {
    await ctx.sendPhoto(product.imageUrl, {
      caption,
      reply_markup: kbData(markup),
      ...HTML,
      ...opts,
    });
  } else {
    await ctx.reply(caption, { ...HTML, reply_markup: kbData(markup), ...opts });
  }
}

async function sendMainMenu(ctx, text) {
  const user = ctx.user;
  await ctx.reply(text || "<b>🛍 MARKETPLACE</b>\n\nChoose an option below.", {
    ...HTML,
    reply_markup: kbData(mainMenu({
      isSeller: !!user?.sellerProfile,
      isAdmin: user?.role === "ADMIN",
    })),
  });
}

module.exports = { HTML, editOrSend, sendProduct, sendMainMenu };