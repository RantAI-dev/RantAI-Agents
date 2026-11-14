/**
 * Sends one request to the Rust server and hands its answer back unbuffered.
 *
 * Runs in the edge middleware and in route handlers, so it uses only fetch, Headers and
 * Response.
 */

/** Hop-by-hop headers, and the ones fetch recomputes. */
const DROP_REQUEST_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "transfer-encoding",
  "te",
  "upgrade",
  "proxy-authorization",
  "proxy-connection",
  "content-length",
  "accept-encoding",
])

/**
 * fetch decodes a compressed body, so the encoding and length it came with no longer describe
 * what we send on.
 */
const DROP_RESPONSE_HEADERS = new Set([
  "connection",
  "keep-alive",
  "transfer-encoding",
  "content-encoding",
  "content-length",
])

/** Marks an answer that came from Rust, so a cut-over can be checked from the browser. */
export const UPSTREAM_HEADER = "x-rantai-upstream"

export interface ForwardOptions {
  /** The body already read from `request`; when absent, the request's own body is read. */
  body?: ArrayBuffer | null
  fetchImpl?: typeof fetch
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers()
  request.headers.forEach((value, key) => {
    const name = key.toLowerCase()
    if (DROP_REQUEST_HEADERS.has(name) || name.startsWith("x-middleware-")) return
    headers.set(key, value)
  })
  // Rust sees only identity bodies, so no decoding is needed on the way back.
  headers.set("accept-encoding", "identity")
  const url = new URL(request.url)
  const host = request.headers.get("host") ?? url.host
  if (!headers.has("x-forwarded-host")) headers.set("x-forwarded-host", host)
  if (!headers.has("x-forwarded-proto")) headers.set("x-forwarded-proto", url.protocol.replace(":", ""))
  return headers
}

function hasBody(method: string): boolean {
  return method !== "GET" && method !== "HEAD"
}

/** The convention's error body (docs/conventions.md), for a Rust server that did not answer. */
function upstreamFailed(request: Request): Response {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID()
  return Response.json(
    {
      error: {
        code: "upstream_failed",
        message: "A service we depend on returned an error.",
        requestId,
      },
    },
    { status: 502, headers: { "x-request-id": requestId, [UPSTREAM_HEADER]: "rust" } },
  )
}

/**
 * Forward `request` to `targetUrl`. The method, headers (cookies and `Authorization` among
 * them) and body go unchanged; the answer's body is the upstream stream itself.
 *
 * A Rust server that cannot be reached is a 502, never a silent answer from Next: the routed
 * surfaces enforce rules (grants) that the TypeScript routes do not.
 */
export async function forwardToRust(
  request: Request,
  targetUrl: string,
  options: ForwardOptions = {},
): Promise<Response> {
  const method = request.method.toUpperCase()
  let body: ArrayBuffer | null = null
  if (hasBody(method)) {
    body = options.body !== undefined ? options.body : await request.arrayBuffer()
  }
  let upstream: Response
  try {
    upstream = await (options.fetchImpl ?? fetch)(targetUrl, {
      method,
      headers: forwardedHeaders(request),
      body: body && body.byteLength > 0 ? body : undefined,
      redirect: "manual",
      signal: request.signal,
    })
  } catch (error) {
    if (request.signal.aborted) throw error
    console.error("[rust-router] the Rust server could not be reached", {
      url: targetUrl,
      error: error instanceof Error ? error.message : String(error),
    })
    return upstreamFailed(request)
  }
  return passThrough(upstream)
}

/** The upstream answer as this server's answer, its body still streaming. */
export function passThrough(upstream: Response): Response {
  const headers = new Headers(upstream.headers)
  for (const name of DROP_RESPONSE_HEADERS) headers.delete(name)
  headers.set(UPSTREAM_HEADER, "rust")
  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers,
  })
}

/** A 4xx whose standard error body carries `code`; reads (and so consumes) the body. */
async function errorCodeOf(response: Response): Promise<string | null> {
  try {
    const parsed = (await response.json()) as { error?: { code?: unknown } } | null
    const code = parsed?.error?.code
    return typeof code === "string" ? code : null
  } catch {
    return null
  }
}

export interface FallbackOptions extends ForwardOptions {
  /** The status and error `code` that send the request to Next instead. */
  fallbackOn: { status: number; code: string }
  /** The TypeScript handler, given a fresh copy of the request. */
  fallback: (request: Request) => Promise<Response> | Response
}

/**
 * Forward to Rust; when it answers `fallbackOn`, run the old handler with the same request.
 * The body is read once and replayed, so the handler sees exactly what Rust saw. Every other
 * answer passes through, streaming.
 */
export async function forwardWithFallback(
  request: Request,
  targetUrl: string,
  options: FallbackOptions,
): Promise<Response> {
  const body = hasBody(request.method.toUpperCase()) ? await request.arrayBuffer() : null
  const response = await forwardToRust(request, targetUrl, { ...options, body })
  if (response.status !== options.fallbackOn.status) return response

  const text = await response.text()
  if ((await errorCodeOf(new Response(text))) !== options.fallbackOn.code) {
    return new Response(text, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  const replay = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: body && body.byteLength > 0 ? body : undefined,
    signal: request.signal,
  })
  return options.fallback(replay)
}
