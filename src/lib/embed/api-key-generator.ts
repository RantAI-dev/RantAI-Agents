import { createHash, randomBytes } from "crypto"

/**
 * Generate a secure API key for embed widgets
 * Format: rantai_live_<32 random alphanumeric chars>
 */
export function generateApiKey(): string {
  const randomPart = randomBytes(24).toString("base64url").slice(0, 32)
  return `rantai_live_${randomPart}`
}

/**
 * Validate API key format
 */
export function validateApiKeyFormat(key: string): boolean {
  return /^rantai_live_[A-Za-z0-9_-]{32}$/.test(key)
}

/**
 * Generate a secure API key for agent REST/WebSocket access
 * Format: rantai_sk_<32 random alphanumeric chars>
 */
export function generateAgentApiKey(): string {
  const randomPart = randomBytes(24).toString("base64url").slice(0, 32)
  return `rantai_sk_${randomPart}`
}

/**
 * Hash an agent API key for storage / lookup.
 *
 * Unsalted SHA-256 hex — the keys are high-entropy (192 random bits) so salting
 * buys nothing, and it MUST stay byte-for-byte identical to the SQL backfill
 * (`encode(digest(key, 'sha256'), 'hex')`) so migrated rows resolve.
 */
export function hashAgentApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

/**
 * Validate agent API key format
 */
export function validateAgentApiKeyFormat(key: string): boolean {
  return /^rantai_sk_[A-Za-z0-9_-]{32}$/.test(key)
}

/**
 * Mask API key for display (show first 12 and last 4 chars)
 */
export function maskApiKey(key: string): string {
  if (key.length < 20) return key
  return `${key.slice(0, 16)}${"•".repeat(20)}${key.slice(-4)}`
}
