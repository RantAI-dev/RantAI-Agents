/**
 * UUID v4 that works in NON-secure browser contexts. `crypto.randomUUID` only
 * exists on HTTPS/localhost; self-hosted deployments served over plain HTTP on
 * an IP (common for on-prem/enterprise) don't have it — calling it there threw
 * and silently killed chat session creation. `crypto.getRandomValues` IS
 * available in insecure contexts, so fall back to building the UUID manually.
 */
export function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 10
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
