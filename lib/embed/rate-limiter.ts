/**
 * Simple in-memory rate limiter using sliding window algorithm
 * Limits: 100 requests per minute per API key
 */

interface RateLimitEntry {
  timestamps: number[]
}

const rateLimitStore = new Map<string, RateLimitEntry>()

const WINDOW_MS = 60 * 1000 // 1 minute
const MAX_REQUESTS = 100 // 100 requests per minute

/**
 * Check if a request should be rate limited
 * @returns { allowed: boolean, remaining: number, resetIn: number }
 */
export function checkRateLimit(apiKeyId: string): {
  allowed: boolean
  remaining: number
  resetIn: number
} {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  // Get or create entry
  let entry = rateLimitStore.get(apiKeyId)
  if (!entry) {
    entry = { timestamps: [] }
    rateLimitStore.set(apiKeyId, entry)
  }

  // Remove timestamps outside the window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)

  // Check if limit exceeded
  if (entry.timestamps.length >= MAX_REQUESTS) {
    const oldestInWindow = Math.min(...entry.timestamps)
    const resetIn = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000)

    return {
      allowed: false,
      remaining: 0,
      resetIn: Math.max(resetIn, 1),
    }
  }

  // Add current request timestamp
  entry.timestamps.push(now)

  return {
    allowed: true,
    remaining: MAX_REQUESTS - entry.timestamps.length,
    resetIn: Math.ceil(WINDOW_MS / 1000),
  }
}

/**
 * Clean up old entries periodically (call this from a cron job or interval)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now()
  const windowStart = now - WINDOW_MS

  for (const [key, entry] of rateLimitStore.entries()) {
    entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart)
    if (entry.timestamps.length === 0) {
      rateLimitStore.delete(key)
    }
  }
}

// Auto-cleanup every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(cleanupRateLimitStore, 5 * 60 * 1000)
}
