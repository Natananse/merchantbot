const { Markup } = require("telegraf");
const { session } = require("../states/session");
const { idleFallback } = require("./start");
const buyerCtl = require("./buyer");
const cartCtl = require("./cart");
const profileCtl = require("./profile");
const sellerCtl = require("./seller");
const productCtl = require("./product");
const adminCtl = require("./admin");
const productService = require("../services/productService");
const validation = require("../utils/validation");
const pkb = require("../keyboards/product");
const { MAIN } = require("../keyboards/main");
const { escapeHtml } = require("../utils/formatters");

// Entry point for every plain-text message.
async function handleText(ctx) {
  const text = String(ctx.message.text || "").trim();
  const st = session.get(ctx.user.id);
  if (!ctx.user) {
    await ctx.reply("Please start the bot with /start first.");
    return;
  }
  if (st && st.step) {
    await handleStep(ctx, st, text);
    return;
  }
  await idleFallback(ctx);
}

async function handleStep(ctx, st, text) {
  const step = st.step;

  switch (step) {
    case "SEARCH":
      if (!text) return;
      await buyerCtl.runSearch(ctx, text);
      break;

    case "REG_NAME": {
      const shopName = validation.requiredText(text, "Shop name", { max: 60 });
      session.update(ctx.user.id, {
        step: "REG_DESC",
        application: { ...st.application, shopName },
      });
      await ctx.reply(
        `✅ Shop name: <b>${escapeHtml(shopName)}</b>\n\nStep 2 of 4 — <b>Shop description</b>\nDescribe your shop (or send "-" to skip).`,
        Markup.inlineKeyboard([[kCancel()]])
      );
      break;
    }

    case "REG_DESC": {
      const description = text === "-" ? null : validation.optionalText(text, { max: 500 });
      session.update(ctx.user.id, {
        step: "REG_PHONE",
        application: { ...st.application, description },
      });
      await ctx.reply("Step 3 of 4 — <b>Phone number</b>\nSend your shop phone number.", Markup.inlineKeyboard([[kCancel()]]));
      break;
    }

    case "REG_PHONE": {
      const phone = validation.phone(text);
      session.update(ctx.user.id, {
        step: "REG_LOC",
        application: { ...st.application, phone },
      });
      await ctx.reply("Step 4 of 4 — <b>Location</b>\nWhere is your shop located?", Markup.inlineKeyboard([[kCancel()]]));
      break;
    }

    case "REG_LOC": {
      const location = validation.requiredText(text, "Location", { max: 200 });
      const app = { ...st.application, location };
      session.update(ctx.user.id, { step: "REG_REVIEW", application: app });
      await ctx.reply(
        `<b>🏪 SELLER APPLICATION</b>\n\n` +
          `Shop: <b>${escapeHtml(app.shopName)}</b>\n` +
          `Description: ${app.description ? escapeHtml(app.description) : "-"}\n` +
          `Phone: ${escapeHtml(app.phone)}\n` +
          `Location: ${escapeHtml(app.location)}`,
        Markup.inlineKeyboard([
          [kBtn("✅ Submit", "app_submit"), kBtn("❌ Cancel", "cancel")],
        ])
      );
      break;
    }

    case "PD_NAME": {
      const name = validation.requiredText(text, "Name", { max: 120 });
      session.update(ctx.user.id, { step: "PD_DESC", draft: { ...st.draft, name } });
      await ctx.reply(
        `✅ Name: <b>${escapeHtml(name)}</b>\n\nStep 2 of 7 — <b>Description</b>\nDescribe the product (or send "-" to skip).`,
        Markup.inlineKeyboard([[kCancel()]])
      );
      break;
    }

    case "PD_DESC": {
      const description = text === "-" ? null : validation.optionalText(text, { max: 1500 });
      session.update(ctx.user.id, { step: "PD_CAT", draft: { ...st.draft, description } });
      await productCtl.showCategoryPicker(ctx, 0);
      break;
    }

    case "PD_CAT":
      await ctx.reply("Please choose a category using the buttons above.", Markup.inlineKeyboard([[kCancel()]]));
      break;

    case "PD_PRICE": {
      const price = validation.positiveNumber(text, "Price");
      session.update(ctx.user.id, { step: "PD_CURRENCY", draft: { ...st.draft, price } });
      await ctx.reply(
        `✅ Price: <b>${price}</b>\n\nStep 5 of 7 — <b>Currency</b>\nPick the currency:`,
        pkb.currencyPicker().reply_markup
      );
      break;
    }

    case "PD_CURRENCY": {
      // Allow typing a currency code directly.
      const currency = text.toUpperCase().slice(0, 8);
      if (!/^[A-Z]{2,8}$/.test(currency)) {
        await ctx.reply("Invalid currency code. Use the buttons or a code like ETB, USD.");
        return;
      }
      session.update(ctx.user.id, { step: "PD_STOCK", draft: { ...st.draft, currency } });
      await ctx.reply(`✅ Currency: <b>${currency}</b>\n\nStep 6 of 7 — <b>Stock</b>\nHow many units are available? Send a whole number (0 or more).`, Markup.inlineKeyboard([[kCancel()]]));
      break;
    }

    case "PD_STOCK": {
      const stock = validation.nonNegativeInteger(text, "Stock");
      session.update(ctx.user.id, {
        step: "PD_IMAGE",
        draft: { ...st.draft, stock, images: st.draft.images || [] },
      });
      await ctx.reply(
        `<b>Step 7 of 7 — Photos</b>\n\nSend <b>product photos</b> (one by one) or an image <b>URL</b>.\nYou can also skip images.`,
        pkb.imageStepKeyboard(st.draft.images).reply_markup
      );
      break;
    }

    case "PD_IMAGE":
      await _handleProductImageText(ctx, st, text);
      break;

    case "PD_REVIEW":
      await ctx.reply("Press ✅ Publish to submit, or ❌ Cancel.", Markup.inlineKeyboard([[kCancel()]]));
      break;

    case "EDIT_NAME":
      await productCtl.saveEditField(ctx, "EDIT_NAME", text);
      break;
    case "EDIT_DESC":
      await productCtl.saveEditField(ctx, "EDIT_DESC", text);
      break;
    case "EDIT_PRICE":
      await productCtl.saveEditField(ctx, "EDIT_PRICE", text);
      break;
    case "EDIT_CURRENCY":
      await productCtl.saveEditField(ctx, "EDIT_CURRENCY", text);
      break;
    case "EDIT_STOCK":
      await productCtl.saveEditField(ctx, "EDIT_STOCK", text);
      break;
    case "EDIT_LOC":
      await productCtl.saveEditField(ctx, "EDIT_LOC", text);
      break;
    case "EDIT_DELIVERY":
      await productCtl.saveEditField(ctx, "EDIT_DELIVERY", text);
      break;
    case "EDIT_IMAGE":
      await _handleEditImageText(ctx, st, text);
      break;

    case "EDIT_PHONE":
      if (!text) return;
      await profileCtl.savePhone(ctx, validation.phone(text));
      break;
    case "EDIT_LOCATION":
      if (!text) return;
      await profileCtl.saveLocation(ctx, validation.requiredText(text, "Location", { max: 200 }));
      break;
    case "EDIT_SHOP":
      if (!text) return;
      await sellerCtl.saveShopField(ctx, text);
      break;

    case "CK_PHONE":
      if (!text) return;
      if (/^skip$/i.test(text) || text === "⏭ Skip") await cartCtl.skipPhone(ctx);
      else await cartCtl.setCheckoutPhone(ctx, validation.phone(text));
      break;
    case "CK_LOC":
      if (!text) return;
      await cartCtl.setCheckoutLocation(ctx, validation.requiredText(text, "Delivery location", { max: 200 }));
      break;
    case "CK_NOTE":
      if (text === "⏭ Skip note") await cartCtl.setCheckoutNote(ctx, null);
      else await cartCtl.setCheckoutNote(ctx, validation.optionalText(text, { max: 500 }));
      break;
    case "CK_CONFIRM":
      await ctx.reply("Press ✅ Confirm Order to finish, or ❌ Cancel.");
      break;

    case "ADMIN_REJECT_APP": {
      const reason = validation.requiredText(text, "Reason", { max: 500 });
      await adminCtl.finishRejectApplication(ctx, reason);
      break;
    }
    case "ADMIN_REJECT_PRODUCT": {
      const reason = validation.requiredText(text, "Reason", { max: 500 });
      await adminCtl.finishRejectProduct(ctx, reason);
      break;
    }
    case "ADMIN_CREATE_CATEGORY": {
      await adminCtl.saveCategory(ctx, text);
      break;
    }

    default:
      await idleFallback(ctx);
  }
}

async function _handleProductImageText(ctx, st, text) {
  const isUrl = /^(https?:\/\/).+/i.test(text);
  if (!isUrl) {
    await ctx.reply("That's not an image URL. Send a photo, an image URL, or press Skip/Done.");
    return;
  }
  session.update(ctx.user.id, {
    step: "PD_REVIEW",
    draft: { ...st.draft, imageUrl: text, images: st.draft.images || [] },
  });
  await ctx.reply("✅ Image URL saved. Review your product:", Markup.inlineKeyboard([[kCancel()]]));
  await productCtl.showReview(ctx);
}

async function _handleEditImageText(ctx, st, text) {
  const isUrl = /^(https?:\/\/).+/i.test(text);
  if (!isUrl) {
    await ctx.reply("Send a photo or an image URL.");
    return;
  }
  await productService.setImages(ctx.user.id, ctx.seller.id, st.productId, [], text);
  session.clear(ctx.user.id);
  await ctx.reply("✅ Image updated.", Markup.inlineKeyboard([[MAIN]]));
}

// Photos → product images ------------------------------------------------

async function handlePhoto(ctx) {
  const st = session.get(ctx.user.id);
  if (!st) {
    await ctx.reply("Photo received but there's no active image step.");
    return;
  }
  const photos = ctx.message.photo;
  const fileId = photos[photos.length - 1].file_id;

  if (st.step === "PD_IMAGE") {
    const images = [...(st.draft.images || []), fileId];
    session.update(ctx.user.id, { draft: { ...st.draft, images } });
    await ctx.reply(
      `🖼 Saved image ${images.length}. Send more, a URL, or press Done/Skip.`,
      pkb.imageStepKeyboard(images).reply_markup
    );
    return;
  }

  if (st.step === "EDIT_IMAGE") {
    await productService.setImages(ctx.user.id, ctx.seller.id, st.productId, [fileId], null);
    session.clear(ctx.user.id);
    await ctx.reply("✅ Photo saved.", Markup.inlineKeyboard([[MAIN]]));
    return;
  }

  await ctx.reply("No active image upload step. Use the menu buttons.");
}

// Contacts → checkout phone -----------------------------------------------

async function handleContact(ctx) {
  const st = session.get(ctx.user.id);
  if (st && st.step === "CK_PHONE") {
    const phone = ctx.message.contact.phone_number || "";
    await cartCtl.setCheckoutPhone(ctx, phone);
    return;
  }
  await ctx.reply("No checkout in progress. Use the 🛍 Cart to checkout.");
}

function kCancel() {
  return { text: "❌ Cancel", callback_data: "cancel" };
}
function kBtn(text, data) {
  return { text, callback_data: data };
}

module.exports = { handleText, handlePhoto, handleContact };