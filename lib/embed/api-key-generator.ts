import { randomBytes } from "crypto"

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
 * Mask API key for display (show first 12 and last 4 chars)
 */
export function maskApiKey(key: string): string {
  if (key.length < 20) return key
  return `${key.slice(0, 16)}${"•".repeat(20)}${key.slice(-4)}`
}
