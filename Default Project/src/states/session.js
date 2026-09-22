// In-memory conversation session manager.
//
// Keyed by Telegram user id so one user's flow can never leak into another
// user's flow. Sessions expire automatically when not touched for 30 minutes.

const SESSION_TTL_MS = 30 * 60 * 1000;

class SessionManager {
  constructor(ttlMs = SESSION_TTL_MS) {
    this.store = new Map();
    this.ttlMs = ttlMs;
  }

  get(userId) {
    const entry = this.store.get(userId);
    if (!entry) return null;
    if (Date.now() - entry.touchedAt > this.ttlMs) {
      this.store.delete(userId);
      return null;
    }
    entry.touchedAt = Date.now();
    return entry.data;
  }

  set(userId, data) {
    this.store.set(userId, { data, touchedAt: Date.now() });
  }

  // Returns previous state merged with the patch, or just the patch if none.
  update(userId, patch) {
    const current = this.get(userId) || {};
    const merged = { ...current, ...patch };
    this.set(userId, merged);
    return merged;
  }

  clear(userId) {
    this.store.delete(userId);
  }

  has(userId) {
    return this.get(userId) !== null;
  }
}

module.exports = { session: new SessionManager(), SessionManager };