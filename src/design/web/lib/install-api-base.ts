/**
 * API-base namespacing shim for the vendored open-design SPA.
 *
 * Upstream open-design talks to a local daemon that owns every bare `/api/*`
 * path. In agents-cloud the SPA is embedded inside the RantAI dashboard, whose
 * Next app ALSO serves many bare `/api/*` routes (auth, chat, organizations, …).
 * To avoid collisions the port re-homes the daemon's endpoints under
 * `/api/design/*` (Next route handlers in `src/app/api/design/**`).
 *
 * The SPA issues ~200 raw `fetch('/api/…')` calls with no central client/base,
 * so rather than patch every call site we install a single, idempotent
 * `window.fetch` interceptor that rewrites same-origin `/api/<rest>` requests to
 * `/api/design/<rest>`.
 *
 * The rewrite is GATED on the current route being under `/dashboard/design`.
 * The design page and its RantAI-dashboard siblings share the same browser
 * document across client-side navigations, so an ungated patch would rewrite
 * (and 404) RantAI's own `/api/*` calls the moment the user navigated away. The
 * gate keeps the interceptor a no-op everywhere except the design SPA's own
 * route subtree.
 *
 * Imported for side effects from `App.tsx` (the SPA's client-only mount root),
 * so it only runs in the browser after the design route has loaded.
 */

const DESIGN_API_PREFIX = "/api/design";
const DESIGN_ROUTE_PREFIX = "/dashboard/design";
const INSTALL_FLAG = "__odDesignApiBaseInstalled";

/** True only while the design SPA owns the current route subtree. */
function underDesignRoute(): boolean {
  const p = window.location.pathname;
  return p === DESIGN_ROUTE_PREFIX || p.startsWith(`${DESIGN_ROUTE_PREFIX}/`);
}

/** A same-origin daemon path that has not already been namespaced. */
function shouldRewrite(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  if (
    pathname === DESIGN_API_PREFIX ||
    pathname.startsWith(`${DESIGN_API_PREFIX}/`)
  ) {
    return false;
  }
  return true;
}

/**
 * Returns a rewritten same-origin *relative* URL (`/api/design/…`) for a raw
 * fetch target, or `null` when the target must be left untouched (cross-origin,
 * non-`/api` path, or already namespaced). Relative output resolves against the
 * page origin for both string and URL/Request inputs.
 */
function rewriteTarget(rawUrl: string, origin: string): string | null {
  const u = new URL(rawUrl, origin);
  if (u.origin !== origin) return null;
  if (!shouldRewrite(u.pathname)) return null;
  const nextPath = u.pathname.replace(/^\/api\//, `${DESIGN_API_PREFIX}/`);
  return `${nextPath}${u.search}${u.hash}`;
}

if (typeof window !== "undefined") {
  const flags = window as unknown as Record<string, unknown>;
  if (!flags[INSTALL_FLAG]) {
    flags[INSTALL_FLAG] = true;
    const originalFetch = window.fetch.bind(window);
    const origin = window.location.origin;

    window.fetch = function odDesignFetch(
      input: RequestInfo | URL,
      init?: RequestInit,
    ): Promise<Response> {
      try {
        if (underDesignRoute()) {
          if (typeof input === "string") {
            const rewritten = rewriteTarget(input, origin);
            if (rewritten) input = rewritten;
          } else if (input instanceof URL) {
            const rewritten = rewriteTarget(input.href, origin);
            if (rewritten) input = new URL(rewritten, origin);
          } else if (input instanceof Request) {
            const rewritten = rewriteTarget(input.url, origin);
            if (rewritten) {
              input = new Request(new URL(rewritten, origin).toString(), input);
            }
          }
        }
      } catch {
        // Any URL parse failure → fall through with the original input.
      }
      return originalFetch(input, init);
    };
  }
}

export {};
