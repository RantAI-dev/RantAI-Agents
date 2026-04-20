/**
 * Unsplash image resolution for artifact content.
 *
 * Public API:
 * - `resolveImages(content)`      — HTML content (safe wrapper, never throws)
 * - `resolveSlideImages(content)` — Slides JSON (safe wrapper, never throws)
 * - `resolveContentImages({ ... })` — generic resolver for new artifact types
 * - `resolveUnsplashQueries(queries)` — bare cache + lookup core
 */

import {
  resolveHtmlImages,
  resolveSlideImages as resolveSlideImagesImpl,
} from "./resolver"

/** Feature flag to enable/disable image resolution */
const ENABLED = true

/**
 * Resolve unsplash:keyword URLs in HTML content to real Unsplash photos.
 *
 * This is a SAFE wrapper that:
 * - Never throws (always returns valid content)
 * - Can be disabled via feature flag
 * - Falls back to original content on any error
 *
 * @param content - HTML content potentially containing unsplash: URLs
 * @returns HTML content with resolved image URLs
 */
export async function resolveImages(content: string): Promise<string> {
  if (!ENABLED) {
    return content
  }

  try {
    return await resolveHtmlImages(content)
  } catch (error) {
    console.error("[unsplash] Resolution failed, using original content:", error)
    return content
  }
}

/**
 * Resolve unsplash:keyword URLs in slides JSON content.
 *
 * This is a SAFE wrapper that:
 * - Never throws (always returns valid content)
 * - Can be disabled via feature flag
 * - Falls back to original content on any error
 *
 * @param content - Slides JSON content potentially containing unsplash: URLs
 * @returns Slides JSON content with resolved image URLs
 */
export async function resolveSlideImages(content: string): Promise<string> {
  if (!ENABLED) {
    return content
  }

  try {
    return await resolveSlideImagesImpl(content)
  } catch (error) {
    console.error(
      "[unsplash] Slide resolution failed, using original content:",
      error,
    )
    return content
  }
}

// Generic helpers for future artifact types (docx, pdf, …) — the thin
// consumers above use these internally. Callers that want stricter error
// propagation can use these directly instead of the safe wrappers.
export { resolveContentImages, resolveUnsplashQueries } from "./resolver"

// Re-export types for consumers
export type { UnsplashPhoto, UnsplashSearchResponse } from "./types"
