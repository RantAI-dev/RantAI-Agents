import { randomBytes } from "crypto"

/**
 * Generate a secure API key for MCP server access.
 * Format: rantai_mcp_<32 random alphanumeric chars>
 */
export function generateMcpApiKey(): string {
  const randomPart = randomBytes(24).toString("base64url").slice(0, 32)
  return `rantai_mcp_${randomPart}`
}

/**
 * Validate MCP API key format.
 */
export function validateMcpApiKeyFormat(key: string): boolean {
  return /^rantai_mcp_[A-Za-z0-9_-]{32}$/.test(key)
}

/**
 * Mask MCP API key for display (show prefix + last 4 chars).
 */
export function maskMcpApiKey(key: string): string {
  if (key.length < 20) return key
  return `${key.slice(0, 15)}${"•".repeat(20)}${key.slice(-4)}`
}
