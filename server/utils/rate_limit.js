// Minimal in-memory sliding-window rate limiter (single-process, MVP-grade).
// For multi-instance deployments a shared store such as Redis would be needed.

export class RateLimiter {
  constructor(maxAttempts, windowSeconds) {
    this.maxAttempts = maxAttempts;
    this.windowSeconds = windowSeconds;
    this.hits = new Map(); // key -> array of timestamps (seconds)
  }

  #prune(key, now) {
    const cutoff = now - this.windowSeconds;
    const list = (this.hits.get(key) || []).filter((t) => t > cutoff);
    if (list.length > 0) this.hits.set(key, list);
    else this.hits.delete(key);
    return list;
  }

  /** Return [allowed, retryAfterSeconds]. Does not record a hit. */
  check(key) {
    const now = Date.now() / 1000;
    const hits = this.#prune(key, now);
    if (hits.length >= this.maxAttempts) {
      const retryAfter = Math.floor(this.windowSeconds - (now - hits[0])) + 1;
      return [false, Math.max(1, retryAfter)];
    }
    return [true, 0];
  }

  /** Record an attempt and return [allowed, retryAfterSeconds]. */
  hit(key) {
    const now = Date.now() / 1000;
    const hits = this.#prune(key, now);
    if (hits.length >= this.maxAttempts) {
      const retryAfter = Math.floor(this.windowSeconds - (now - hits[0])) + 1;
      return [false, Math.max(1, retryAfter)];
    }
    hits.push(now);
    this.hits.set(key, hits);
    return [true, 0];
  }

  reset(key = null) {
    if (key === null) this.hits.clear();
    else this.hits.delete(key);
  }
}
