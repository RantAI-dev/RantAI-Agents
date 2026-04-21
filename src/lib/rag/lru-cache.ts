export interface LruCacheOptions {
  /** Maximum number of entries retained. Required. */
  maxSize: number;
  /** Optional TTL in ms. Entries older than this are treated as missing and evicted lazily. */
  ttlMs?: number;
}

interface Entry<V> { value: V; at: number; }

/**
 * Tiny single-file LRU cache. No external dependency. Uses the Map insertion
 * order invariant: re-setting a key, or deleting-then-setting on read, moves it
 * to most-recent.
 */
export class LruCache<K, V> {
  private readonly max: number;
  private readonly ttlMs?: number;
  private readonly map = new Map<K, Entry<V>>();

  constructor(opts: LruCacheOptions) {
    this.max = opts.maxSize;
    this.ttlMs = opts.ttlMs;
  }

  get(key: K): V | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (this.ttlMs !== undefined && Date.now() - e.at > this.ttlMs) {
      this.map.delete(key);
      return undefined;
    }
    // Move to most-recent
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key);
    this.map.set(key, { value, at: Date.now() });
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }

  delete(key: K): boolean { return this.map.delete(key); }
  clear(): void { this.map.clear(); }
  get size(): number { return this.map.size; }
}
