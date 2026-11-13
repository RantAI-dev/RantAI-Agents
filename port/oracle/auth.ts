#!/usr/bin/env bun
/**
 * Oracle for the auth slice: it issues the credentials the Rust side verifies and writes the
 * vectors to `port/cases/auth.jsonl`. Never hand-type a case: run this.
 *
 *   bunx prisma generate            # `src/lib/mobile-auth.ts` imports the Prisma client
 *   bun port/oracle/auth.ts > port/cases/auth.jsonl
 *
 * It uses the real code, not a copy:
 *  - `next-auth/jwt` re-exports `@auth/core/jwt`, so `encode` is the function Auth.js itself
 *    uses to write the session cookie,
 *  - `signMobileToken` from `src/lib/mobile-auth.ts` signs the mobile Bearer JWT,
 *  - `hashAgentApiKey` and `validateApiKeyFormat` from `src/lib/embed/api-key-generator.ts`
 *    hash and check the API keys.
 *
 * The secret below is a test secret. It is only ever used to sign these vectors.
 */
import { decode, encode } from "next-auth/jwt"

const SECRET = "port-only-secret-for-the-auth-parity-vectors"
const OTHER_SECRET = "port-only-other-secret-for-the-auth-parity-vectors"

/** The two cookie names Auth.js uses, and the salt the key is derived with. */
const COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"]

/** The claims the app's session token carries: `id` and `role` come from the jwt callback. */
const SESSION_CLAIMS = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  picture: null,
  sub: "user_ada",
  id: "user_ada",
  role: "USER",
}

// The mobile module reads NEXTAUTH_SECRET when it is loaded, so it has to be set first.
process.env.NEXTAUTH_SECRET = SECRET
const { signMobileToken } = await import("../../src/lib/mobile-auth")
const { hashAgentApiKey, validateAgentApiKeyFormat, validateApiKeyFormat } = await import(
  "../../src/lib/embed/api-key-generator"
)

/** One case per line. */
const cases: unknown[] = []

function emit(item: unknown): void {
  cases.push(item)
}

/** The payload of a token, decoded. */
function payloadOf(token: string): Record<string, unknown> {
  const part = token.split(".")[1]
  if (!part) throw new Error("token without a payload")
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as Record<string, unknown>
}

/** Change one character of a part of the token, so it no longer verifies. */
function tamper(token: string, index: number): string {
  const parts = token.split(".")
  const part = parts[index]
  if (!part) throw new Error(`token without a part ${index}`)
  const first = part[0] ?? "A"
  const replacement = first === "A" ? "B" : "A"
  parts[index] = replacement + part.slice(1)
  return parts.join(".")
}

/** The session cookie as Auth.js writes it: `name=value`. */
function cookie(name: string, value: string): string {
  return `${name}=${value}`
}

/** The session cookie split in two, the way Auth.js splits one that is too long. */
function chunkedCookie(name: string, value: string, size: number): string {
  const chunks: string[] = []
  for (let index = 0; index < value.length; index += size) {
    chunks.push(value.slice(index, index + size))
  }
  return chunks.map((part, index) => `${name}.${index}=${part}`).join("; ")
}

/** The claims of a session token, read back with Auth.js' own decode. */
async function sessionClaimsOf(
  token: string,
  secret: string,
  salt: string
): Promise<Record<string, unknown>> {
  const payload = await decode({ token, secret, salt })
  if (!payload) throw new Error("the session token did not decode")
  return {
    id: payload.id ?? null,
    role: payload.role ?? null,
    email: payload.email ?? null,
    name: payload.name ?? null,
    sub: payload.sub ?? null,
    issuedAt: payload.iat ?? null,
    expiresAt: payload.exp ?? null,
  }
}

/** The claims of a mobile token, with the fields the Rust side reads. */
function mobileClaimsOf(token: string): Record<string, unknown> {
  const payload = payloadOf(token)
  return {
    userId: payload.sub ?? null,
    email: payload.email ?? null,
    role: payload.role ?? null,
    issuedAt: payload.iat ?? null,
    expiresAt: payload.exp ?? null,
  }
}

// The session cookie, under both cookie names.
for (const cookieName of COOKIE_NAMES) {
  const token = await encode({
    token: SESSION_CLAIMS,
    secret: SECRET,
    salt: cookieName,
  })
  const claims = await sessionClaimsOf(token, SECRET, cookieName)
  const now = claims.issuedAt as number

  emit({
    kind: "session",
    name: `valid ${cookieName}`,
    secret: SECRET,
    cookie: cookie(cookieName, token),
    now,
    expect: { valid: true, claims },
  })

  // The same cookie among other cookies.
  emit({
    kind: "session",
    name: `valid ${cookieName} among other cookies`,
    secret: SECRET,
    cookie: `theme=dark; ${cookie(cookieName, token)}; locale=en`,
    now,
    expect: { valid: true, claims },
  })

  // A long cookie, split into chunks the way Auth.js splits it.
  emit({
    kind: "session",
    name: `chunked ${cookieName}`,
    secret: SECRET,
    cookie: chunkedCookie(cookieName, token, 200),
    now,
    expect: { valid: true, claims },
  })

  // Expired: Auth.js signs with a max age in the past.
  const expired = await encode({
    token: SESSION_CLAIMS,
    secret: SECRET,
    salt: cookieName,
    maxAge: -3600,
  })
  emit({
    kind: "session",
    name: `expired ${cookieName}`,
    secret: SECRET,
    cookie: cookie(cookieName, expired),
    now: Math.floor(Date.now() / 1000),
    expect: { valid: false },
  })

  // Tampered: the ciphertext no longer matches the tag.
  emit({
    kind: "session",
    name: `tampered ${cookieName}`,
    secret: SECRET,
    cookie: cookie(cookieName, tamper(token, 3)),
    now,
    expect: { valid: false },
  })

  // The wrong secret.
  emit({
    kind: "session",
    name: `wrong secret ${cookieName}`,
    secret: OTHER_SECRET,
    cookie: cookie(cookieName, token),
    now,
    expect: { valid: false },
  })

  // The token was issued under one cookie name and presented under the other: the key is
  // derived with the cookie name as the salt, so it does not verify.
  const otherName = cookieName === COOKIE_NAMES[0] ? COOKIE_NAMES[1] : COOKIE_NAMES[0]
  emit({
    kind: "session",
    name: `issued under ${cookieName}, presented under ${otherName}`,
    secret: SECRET,
    cookie: cookie(otherName, token),
    now,
    expect: { valid: false },
  })
}

// The secret can be rotated: the token carries the thumbprint of the key it was issued with.
{
  const token = await encode({
    token: SESSION_CLAIMS,
    secret: SECRET,
    salt: COOKIE_NAMES[0],
  })
  const claims = await sessionClaimsOf(token, SECRET, COOKIE_NAMES[0])
  emit({
    kind: "session",
    name: "rotated secret",
    secrets: [OTHER_SECRET, SECRET],
    cookie: cookie(COOKIE_NAMES[0], token),
    now: claims.issuedAt as number,
    expect: { valid: true, claims },
  })
}

// No session cookie at all.
emit({
  kind: "session",
  name: "no session cookie",
  secret: SECRET,
  cookie: "theme=dark; locale=en",
  now: 0,
  expect: { valid: false },
})

// The mobile Bearer JWT, signed by the old code.
{
  const token = await signMobileToken({
    id: "user_ada",
    email: "ada@example.com",
    role: "USER",
  })
  const claims = mobileClaimsOf(token)
  emit({
    kind: "mobile",
    name: "valid",
    secret: SECRET,
    token,
    now: claims.issuedAt as number,
    issuedAt: claims.issuedAt as number,
    issuedToken: token,
    expect: { valid: true, claims },
  })

  // The token is dead the second it expires.
  emit({
    kind: "mobile",
    name: "expired",
    secret: SECRET,
    token,
    now: (claims.expiresAt as number) + 1,
    expect: { valid: false },
  })

  // The signature no longer matches.
  emit({
    kind: "mobile",
    name: "tampered",
    secret: SECRET,
    token: tamper(token, 2),
    now: claims.issuedAt as number,
    expect: { valid: false },
  })

  // The wrong secret.
  emit({
    kind: "mobile",
    name: "wrong secret",
    secret: OTHER_SECRET,
    token,
    now: claims.issuedAt as number,
    expect: { valid: false },
  })
}

// A mobile token without a role: the old code signs `role: undefined`, which JSON drops.
{
  const token = await signMobileToken({
    id: "user_grace",
    email: "grace@example.com",
    role: null,
  })
  const claims = mobileClaimsOf(token)
  emit({
    kind: "mobile",
    name: "without a role",
    secret: SECRET,
    token,
    now: claims.issuedAt as number,
    issuedAt: claims.issuedAt as number,
    issuedToken: token,
    expect: { valid: true, claims },
  })
}

// The agent API keys: the value the database stores and the route looks up.
for (const key of [
  "rantai_sk_0123456789abcdefghijklmnopqrstuv",
  "rantai_sk_-_0123456789abcdefghijklmnopqrst",
  "rantai_sk_tooshort",
  "not_an_agent_key_0123456789abcdefghijklmnopq",
]) {
  emit({
    kind: "api-key",
    name: `agent key ${key.slice(0, 12)}`,
    key,
    expect: {
      hash: hashAgentApiKey(key),
      formatValid: validateAgentApiKeyFormat(key),
    },
  })
}

// The widget embed keys: the format is checked, the key itself is looked up.
for (const key of [
  "rantai_live_0123456789abcdefghijklmnopqrstuv",
  "rantai_live_-_0123456789abcdefghijklmnopqrst",
  "rantai_live_tooshort",
  "rantai_sk_0123456789abcdefghijklmnopqrstuv",
]) {
  emit({
    kind: "widget-key",
    name: `widget key ${key.slice(0, 12)}`,
    key,
    expect: { formatValid: validateApiKeyFormat(key) },
  })
}

// The address of the caller and the key's whitelist.
//
// The two expressions are copied from `src/features/agent-api/service.ts`
// (`authenticateV1Request`) and `src/features/agent-api-keys/service.ts`
// (`authenticateAgentApiKey`): the service module cannot be imported outside Next.js, and
// the whitelist check needs a database.
function requestIpOf(xForwardedFor: string | null, xRealIp: string | null): string | undefined {
  return (
    xForwardedFor?.split(",")[0]?.trim() ||
    xRealIp?.trim() ||
    undefined
  )
}

function allowedBy(whitelist: string[], requestIp: string | undefined): boolean {
  if (whitelist.length > 0) {
    return Boolean(requestIp) && whitelist.includes(requestIp as string)
  }
  return true
}

for (const item of [
  { xForwardedFor: "203.0.113.7, 70.41.3.18", xRealIp: "198.51.100.4" },
  { xForwardedFor: "203.0.113.7", xRealIp: "198.51.100.4" },
  { xForwardedFor: null, xRealIp: "198.51.100.4" },
  { xForwardedFor: "", xRealIp: "198.51.100.4" },
  { xForwardedFor: "  203.0.113.7  ", xRealIp: null },
  { xForwardedFor: null, xRealIp: null },
]) {
  const requestIp = requestIpOf(item.xForwardedFor, item.xRealIp)
  for (const whitelist of [[], ["203.0.113.7"], ["198.51.100.4"], ["10.0.0.1"]]) {
    emit({
      kind: "ip",
      name: `address ${item.xForwardedFor ?? "-"} / ${item.xRealIp ?? "-"} whitelist [${whitelist.join(",")}]`,
      xForwardedFor: item.xForwardedFor,
      xRealIp: item.xRealIp,
      whitelist,
      expect: {
        requestIp: requestIp ?? null,
        allowed: allowedBy(whitelist, requestIp),
      },
    })
  }
}

for (const item of cases) {
  console.log(JSON.stringify(item))
}
