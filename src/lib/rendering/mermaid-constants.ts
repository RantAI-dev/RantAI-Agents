/**
 * Constants shared between the client-side mermaid renderer and the
 * server-side cache helpers. Kept in a dedicated file so the server
 * module (which imports `@/lib/prisma`) doesn't pull in the client-only
 * render module.
 */

/**
 * Mermaid library version. Part of the cache hash input so upgrading
 * `mermaid` in package.json automatically invalidates prior renders.
 *
 * Bump this manually whenever `mermaid` is upgraded — it must match
 * package.json. Automating via runtime fs read is avoided because the
 * constant is used from browser code where `fs` isn't available.
 */
export const MERMAID_VERSION = "11.12.2"

/**
 * Opaque theme identifier, part of the cache hash input. Bump whenever
 * the `themeVariables` block inside `renderMermaidToPng` changes so
 * prior cache entries (rendered with the old theme) are superseded.
 */
export const MERMAID_THEME_KEY = "default-v1"

/**
 * Maximum rendered-PNG size we will persist to the cache (bytes).
 * Entries above this cap always render successfully and return to the
 * caller — they just skip the cache write (logged with actual size for
 * observability so the cap can be tuned later).
 */
export const MERMAID_CACHE_MAX_BYTES = 2 * 1024 * 1024
