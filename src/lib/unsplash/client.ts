/**
 * Unsplash API client
 */

import type { UnsplashPhoto, UnsplashSearchResponse } from "./types"

const API_URL = "https://api.unsplash.com/search/photos"
const TIMEOUT_MS = 5000

/**
 * Search for a photo on Unsplash.
 * Returns the first result or null if not found / API unavailable.
 */
export async function searchPhoto(query: string): Promise<UnsplashPhoto | null> {
  const apiKey = process.env.UNSPLASH_API_KEY
  if (!apiKey) {
    return null
  }

  try {
    const url = `${API_URL}?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`
    const response = await fetch(url, {
      headers: {
        Authorization: `Client-ID ${apiKey}`,
        "Accept-Version": "v1",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!response.ok) {
      console.warn(`[unsplash] API returned ${response.status} for query: ${query}`)
      return null
    }

    const data: UnsplashSearchResponse = await response.json()
    return data.results?.[0] ?? null
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      console.warn(`[unsplash] Timeout for query: ${query}`)
    } else {
      console.warn(`[unsplash] Error fetching photo:`, error)
    }
    return null
  }
}
