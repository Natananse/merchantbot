// Simple structured logger. Logs technical errors to the console using
// readable key/value pairs so beginners can diagnose issues.
/* eslint-disable no-console */

function timestamp() {
  return new Date().toISOString();
}

function log(context, meta = {}) {
  const parts = [`[${timestamp()}]`, `[${context}]`];
  for (const [key, value] of Object.entries(meta)) {
    const safe =
      typeof value === "string" ? value : JSON.stringify(value ?? "null");
    parts.push(`${key}=${safe}`);
  }
  console.log(parts.join(" "));
}

function logError(context, meta = {}) {
  const parts = [`[${timestamp()}]`, `[ERROR][${context}]`];
  for (const [key, value] of Object.entries(meta)) {
    let safe;
    if (value instanceof Error) {
      safe = value.message;
    } else if (typeof value === "string") {
      safe = value;
    } else if (value === undefined || value === null) {
      safe = "null";
    } else {
      safe = JSON.stringify(value);
    }
    parts.push(`${key}=${safe}`);
  }
  console.error(parts.join(" "));
}

module.exports = { log, logError, timestamp };