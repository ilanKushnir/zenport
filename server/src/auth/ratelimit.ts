/** Fixed-window in-memory rate limiter for login/setup attempts. */
export class RateLimiter {
  private hits = new Map<string, { windowStart: number; count: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  tryTake(key: string, now: number = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { windowStart: now, count: 1 });
      return true;
    }
    if (entry.count >= this.max) return false;
    entry.count++;
    return true;
  }

  /** Drop stale windows so long-running servers do not accumulate keys. */
  prune(now: number = Date.now()): void {
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }
}
