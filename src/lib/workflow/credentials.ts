import { createCipheriv, createDecipheriv, randomBytes } from "crypto"

const ALGORITHM = "aes-256-gcm"
const IV_LENGTH = 16
const AUTH_TAG_LENGTH = 16

function getEncryptionKey(): Buffer {
  const key = process.env.CREDENTIAL_ENCRYPTION_KEY
  if (!key) {
    throw new Error("CREDENTIAL_ENCRYPTION_KEY environment variable is not set")
  }
  // Key must be 32 bytes for AES-256. Accept hex-encoded (64 chars) or raw 32-byte string.
  if (key.length === 64 && /^[0-9a-fA-F]+$/.test(key)) {
    return Buffer.from(key, "hex")
  }
  if (key.length === 32) {
    return Buffer.from(key, "utf-8")
  }
  throw new Error(
    "CREDENTIAL_ENCRYPTION_KEY must be 32 bytes (raw) or 64 hex characters"
  )
}

/**
 * Encrypt credential data using AES-256-GCM.
 * Returns a base64 string containing: iv + authTag + ciphertext
 */
export function encryptCredential(data: Record<string, unknown>): string {
  const key = getEncryptionKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)

  const plaintext = JSON.stringify(data)
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf-8"),
    cipher.final(),
  ])
  const authTag = cipher.getAuthTag()

  // Pack: iv (16) + authTag (16) + ciphertext (N)
  const packed = Buffer.concat([iv, authTag, encrypted])
  return packed.toString("base64")
}

/**
 * Decrypt credential data from base64 string back to the original object.
 */
export function decryptCredential(
  encryptedBase64: string
): Record<string, unknown> {
  const key = getEncryptionKey()
  const packed = Buffer.from(encryptedBase64, "base64")

  if (packed.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error("Invalid encrypted credential data: too short")
  }

  const iv = packed.subarray(0, IV_LENGTH)
  const authTag = packed.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = packed.subarray(IV_LENGTH + AUTH_TAG_LENGTH)

  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return JSON.parse(decrypted.toString("utf-8"))
}

/**
 * Encrypt a simple key-value object (e.g. MCP env/headers).
 * Stores as { _encrypted: "base64..." } so callers can detect encrypted vs legacy plaintext.
 */
export function encryptJsonField(
  data: Record<string, string> | null | undefined
): { _encrypted: string } | null {
  if (!data || Object.keys(data).length === 0) return null
  return { _encrypted: encryptCredential(data) }
}

/**
 * Decrypt a JSON field that may be encrypted ({ _encrypted: "..." }) or legacy plaintext.
 */
export function decryptJsonField(
  stored: unknown
): Record<string, string> | null {
  if (!stored || typeof stored !== "object") return null
  const obj = stored as Record<string, unknown>
  if ("_encrypted" in obj && typeof obj._encrypted === "string") {
    return decryptCredential(obj._encrypted) as Record<string, string>
  }
  // Legacy plaintext — return as-is
  return stored as Record<string, string>
}

/**
 * Supported credential types and their expected data shapes.
 */
export type CredentialType = "api_key" | "oauth2" | "basic_auth" | "bearer"

export interface CredentialData {
  api_key: { apiKey: string }
  oauth2: {
    clientId: string
    clientSecret: string
    accessToken?: string
    refreshToken?: string
    tokenUrl?: string
  }
  basic_auth: { username: string; password: string }
  bearer: { token: string }
}

/**
 * Resolve a credential's decrypted data for use in node execution.
 * Returns headers to merge into HTTP requests.
 */
export function credentialToHeaders(
  type: CredentialType,
  data: Record<string, unknown>
): Record<string, string> {
  switch (type) {
    case "api_key":
      return { Authorization: `Bearer ${data.apiKey}` }
    case "bearer":
      return { Authorization: `Bearer ${data.token}` }
    case "basic_auth": {
      const encoded = Buffer.from(
        `${data.username}:${data.password}`
      ).toString("base64")
      return { Authorization: `Basic ${encoded}` }
    }
    case "oauth2":
      if (data.accessToken) {
        return { Authorization: `Bearer ${data.accessToken}` }
      }
      return {}
    default:
      return {}
  }
}
