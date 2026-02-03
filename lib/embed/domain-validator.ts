/**
 * Validate if a domain is allowed based on allowedDomains list
 * Supports:
 * - Exact match: "example.com"
 * - Wildcard subdomains: "*.example.com" matches "app.example.com", "www.example.com"
 * - Localhost for development: "localhost", "127.0.0.1"
 */
export function validateDomain(
  requestOrigin: string | null,
  allowedDomains: string[]
): { valid: boolean; domain: string | null } {
  // If no allowed domains specified, allow all
  if (!allowedDomains || allowedDomains.length === 0) {
    return { valid: true, domain: null }
  }

  // Extract hostname from origin or referer
  let hostname: string | null = null

  if (requestOrigin) {
    try {
      const url = new URL(requestOrigin)
      hostname = url.hostname
    } catch {
      // If it's not a valid URL, treat it as hostname directly
      hostname = requestOrigin
    }
  }

  if (!hostname) {
    return { valid: false, domain: null }
  }

  // Check against each allowed domain
  for (const allowed of allowedDomains) {
    const normalizedAllowed = allowed.toLowerCase().trim()
    const normalizedHostname = hostname.toLowerCase()

    // Wildcard subdomain match: *.example.com
    if (normalizedAllowed.startsWith("*.")) {
      const baseDomain = normalizedAllowed.slice(2)
      // Match exact base domain or any subdomain
      if (
        normalizedHostname === baseDomain ||
        normalizedHostname.endsWith(`.${baseDomain}`)
      ) {
        return { valid: true, domain: hostname }
      }
    }
    // Exact match
    else if (normalizedHostname === normalizedAllowed) {
      return { valid: true, domain: hostname }
    }
  }

  return { valid: false, domain: hostname }
}

/**
 * Extract origin from request headers
 * Tries Origin header first, then Referer
 */
export function extractOrigin(headers: Headers): string | null {
  const origin = headers.get("Origin")
  if (origin && origin !== "null") {
    return origin
  }

  const referer = headers.get("Referer")
  if (referer) {
    try {
      const url = new URL(referer)
      return url.origin
    } catch {
      return null
    }
  }

  return null
}

/**
 * Check if request is from localhost (for development)
 */
export function isLocalhost(origin: string | null): boolean {
  if (!origin) return false

  try {
    const url = new URL(origin)
    const hostname = url.hostname.toLowerCase()
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname.endsWith(".local")
    )
  } catch {
    return false
  }
}
