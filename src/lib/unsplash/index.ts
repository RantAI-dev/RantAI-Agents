/**
 * Unsplash image resolution for HTML artifacts.
 *
 * Main export: resolveImages() - safe wrapper that never throws.
 */

import { resolveHtmlImages, resolveSlideImages as resolveSlideImagesImpl } from "./resolver"

/** Disable Unsplash resolution by setting `UNSPLASH_RESOLUTION_DISABLED=true`.
 *  Default is enabled. Replaces a hardcoded `const ENABLED = true` kill
 *  switch that could only be toggled by editing source. */
function isUnsplashDisabled(): boolean {
  return process.env.UNSPLASH_RESOLUTION_DISABLED === "true"
}

/**
 * Resolve unsplash:keyword URLs in HTML content to real Unsplash photos.
 *
 * This is a SAFE wrapper that:
 * - Never throws (always returns valid content)
 * - Can be disabled via env flag
 * - Falls back to original content on any error
 *
 * @param content - HTML content potentially containing unsplash: URLs
 * @returns HTML content with resolved image URLs
 */
export async function resolveImages(content: string): Promise<string> {
  if (isUnsplashDisabled()) {
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
 * - Can be disabled via env flag
 * - Falls back to original content on any error
 *
 * @param content - Slides JSON content potentially containing unsplash: URLs
 * @returns Slides JSON content with resolved image URLs
 */
export async function resolveSlideImages(content: string): Promise<string> {
  if (isUnsplashDisabled()) {
    return content
  }

  try {
    return await resolveSlideImagesImpl(content)
  } catch (error) {
    console.error("[unsplash] Slide resolution failed, using original content:", error)
    return content
  }
}

// Re-export types for consumers
export type { UnsplashPhoto, UnsplashSearchResponse } from "./types"
