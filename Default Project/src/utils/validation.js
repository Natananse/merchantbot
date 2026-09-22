// Lightweight backend validation helpers.
// These are the LAST line of defence — Telegram UI validation is not trusted.

const { ValidationError } = require("./errors");

const MAX_TEXT_LENGTH = 3000;

function requiredText(value, fieldName, { max = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty.`);
  }
  const text = value.trim();
  if (text.length > max) {
    throw new ValidationError(`${fieldName} is too long (max ${max} characters).`);
  }
  return text;
}

function optionalText(value, { max = MAX_TEXT_LENGTH } = {}) {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const text = value.trim();
  if (text.length > max) {
    throw new ValidationError(`Text is too long (max ${max} characters).`);
  }
  return text;
}

function positiveNumber(value, fieldName) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) {
    throw new ValidationError(`${fieldName} must be a positive number.`);
  }
  return num;
}

function nonNegativeInteger(value, fieldName) {
  const stringValue = String(value).trim();
  if (!/^\d+$/.test(stringValue)) {
    throw new ValidationError(`${fieldName} must be a whole number (0 or more).`);
  }
  const num = Number(stringValue);
  if (!Number.isSafeInteger(num) || num < 0) {
    throw new ValidationError(`${fieldName} must be a whole number (0 or more).`);
  }
  return num;
}

function idParam(value, fieldName = "id") {
  const num = Number(value);
  if (!Number.isSafeInteger(num) || num <= 0) {
    throw new ValidationError(`Invalid ${fieldName}.`);
  }
  return num;
}

function phone(value) {
  const text = value.trim().replace(/\s+/g, "");
  if (!/^[+]?[0-9]{6,15}$/.test(text)) {
    throw new ValidationError(
      "Please enter a valid phone number (digits only, 6-15 characters, optional leading +)."
    );
  }
  return text;
}

module.exports = {
  requiredText,
  optionalText,
  positiveNumber,
  nonNegativeInteger,
  idParam,
  phone,
  MAX_TEXT_LENGTH,
};