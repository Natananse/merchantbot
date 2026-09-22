// Friendly error types. These become short, human-readable Telegram messages.
// Unexpected errors are caught by the global handler instead.

class AppError extends Error {
  constructor(message, { showToUser = true } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.showToUser = showToUser;
  }
}

class ValidationError extends AppError {}

class NotFoundError extends AppError {}

class ForbiddenError extends AppError {}

class InsufficientStockError extends AppError {}

class BusinessRuleError extends AppError {}

// Wraps an async handler so any error is logged structurally and the user
// always receives a friendly fallback message (never a stack trace).
// The error is NOT re-thrown — handling stops cleanly here.
function safe(fn, contextName) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      const { logError } = require("./logger");
      logError(contextName || fn.name, {
        message: err.message,
        stack: err.stack ? err.stack.split("\n").slice(0, 4).join(" | ") : "",
      });
      const ctx = args.find((a) => a && typeof a.reply === "function");
      if (ctx) {
        const text =
          err instanceof AppError && err.showToUser
            ? err.message
            : "Something went wrong. Please try again.";
        try {
          await ctx.reply(`⚠️ ${text}`);
        } catch (_) {
          // ignore secondary failures
        }
      }
      return undefined;
    }
  };
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  ForbiddenError,
  InsufficientStockError,
  BusinessRuleError,
  safe,
};