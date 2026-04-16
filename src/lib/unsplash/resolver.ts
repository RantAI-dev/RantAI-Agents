/**
 * Image resolution logic for HTML artifacts.
 * Resolves unsplash:keyword URLs to real Unsplash photos.
 */

import { prisma } from "@/lib/prisma"
import { searchPhoto } from "./client"

/** Regex to match src="unsplash:keyword" or src='unsplash:keyword' */
const UNSPLASH_REGEX = /src=["']unsplash:([^"']+)["']/gi

/** Cache duration in days */
const CACHE_DAYS = 30

/**
 * Normalize a search query for consistent caching.
 */
function normalize(query: string): string {
  return query
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ") // Collapse whitespace
    .slice(0, 50) // Max 50 chars
}

/**
 * Generate a fallback placeholder URL with the keyword as text.
 */
function fallbackUrl(query: string): string {
  const encoded = encodeURIComponent(query)
  // Gray background (#f1f5f9) with dark text (#64748b)
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encoded}`
}

/**
 * Resolve all unsplash:keyword URLs in HTML content to real Unsplash photos.
 * Falls back to placehold.co if Unsplash is unavailable.
 */
export async function resolveHtmlImages(content: string): Promise<string> {
  // 1. Extract all unsplash: URLs
  const matches = [...content.matchAll(UNSPLASH_REGEX)]
  if (matches.length === 0) {
    return content
  }

  // 2. Dedupe and normalize queries
  const queries = [...new Set(matches.map((m) => normalize(m[1])))]
  const resolved = await resolveQueries(queries)

  // 3. Replace all unsplash: URLs with resolved URLs
  return content.replace(UNSPLASH_REGEX, (_, rawQuery) => {
    const normalizedQuery = normalize(rawQuery)
    const url = resolved.get(normalizedQuery) ?? fallbackUrl(rawQuery)
    return `src="${url}"`
  })
}

/** Slide type for resolver (minimal fields we need) */
interface SlideForResolver {
  imageUrl?: string
  backgroundImage?: string
  quoteImage?: string
  gallery?: Array<{ imageUrl?: string; caption?: string }>
}

/**
 * Resolve unsplash:keyword URLs in slides JSON content.
 * Handles: imageUrl, backgroundImage, quoteImage, gallery[].imageUrl
 */
export async function resolveSlideImages(content: string): Promise<string> {
  // Try to parse as JSON
  let data: { slides?: SlideForResolver[] }
  try {
    data = JSON.parse(content)
  } catch {
    return content // Not valid JSON, return as-is
  }

  if (!data.slides || !Array.isArray(data.slides)) {
    return content
  }

  // 1. Collect all unsplash: URLs from slides
  const unsplashUrls: string[] = []
  for (const slide of data.slides) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.imageUrl.slice(9)))
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.backgroundImage.slice(9)))
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      unsplashUrls.push(normalize(slide.quoteImage.slice(9)))
    }
    // Gallery items
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          unsplashUrls.push(normalize(item.imageUrl.slice(9)))
        }
      }
    }
  }

  if (unsplashUrls.length === 0) {
    return content
  }

  // 2. Resolve all unique queries
  const queries = [...new Set(unsplashUrls)]
  const resolved = await resolveQueries(queries)

  // 3. Replace unsplash: URLs in slides
  for (const slide of data.slides) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      const query = normalize(slide.imageUrl.slice(9))
      slide.imageUrl = resolved.get(query) ?? fallbackUrl(query)
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      const query = normalize(slide.backgroundImage.slice(9))
      slide.backgroundImage = resolved.get(query) ?? fallbackUrl(query)
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      const query = normalize(slide.quoteImage.slice(9))
      slide.quoteImage = resolved.get(query) ?? fallbackUrl(query)
    }
    // Gallery items
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          const query = normalize(item.imageUrl.slice(9))
          item.imageUrl = resolved.get(query) ?? fallbackUrl(query)
        }
      }
    }
  }

  return JSON.stringify(data)
}

/**
 * Resolve a list of queries to URLs (with caching).
 * Shared logic between HTML and Slides resolvers.
 */
async function resolveQueries(queries: string[]): Promise<Map<string, string>> {
  const resolved = new Map<string, string>()

  // 1. Check cache first
  try {
    const cached = await prisma.resolvedImage.findMany({
      where: { query: { in: queries } },
    })
    for (const entry of cached) {
      resolved.set(entry.query, entry.url)
    }
  } catch (error) {
    console.warn("[unsplash] Cache lookup failed:", error)
  }

  // 2. Fetch uncached queries in parallel
  const uncached = queries.filter((q) => !resolved.has(q))

  await Promise.all(
    uncached.map(async (query) => {
      const photo = await searchPhoto(query)

      if (photo) {
        // Use regular size with width parameter for optimal loading
        const url = `${photo.urls.regular}&w=1200`
        resolved.set(query, url)

        // Cache the result
        try {
          await prisma.resolvedImage.create({
            data: {
              query,
              url,
              attribution: `Photo by ${photo.user.name} on Unsplash`,
              expiresAt: new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000),
            },
          })
        } catch {
          // Ignore duplicate key errors (race condition)
        }
      } else {
        // Unsplash failed - use placeholder with keyword text
        resolved.set(query, fallbackUrl(query))
      }
    })
  )

  return resolved
}
