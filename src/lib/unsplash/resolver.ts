/**
 * Resolve `unsplash:<keyword>` pseudo-URLs to real Unsplash photos.
 *
 * Two public entry points (HTML and Slides) share a generic
 * `resolveContentImages` helper — the shared helper owns the cache
 * + Unsplash lookup, and each consumer plugs in its own format-specific
 * extract/rewrite callbacks.
 */

import { prisma } from "@/lib/prisma"
import { searchPhoto } from "./client"

/** Regex to match src="unsplash:keyword" or src='unsplash:keyword' */
const UNSPLASH_REGEX = /src=["']unsplash:([^"']+)["']/gi

/**
 * Regex to match markdown image syntax `![alt](unsplash:keyword)` or
 * `![alt](unsplash:keyword "title")`. Captures alt (group 1), keyword
 * (group 2), and the optional title suffix (group 3, includes any
 * leading space).
 */
const UNSPLASH_MARKDOWN_REGEX =
  /!\[([^\]]*)\]\(unsplash:([^)"\s]+)(\s+"[^"]*")?\)/g

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
 * Generic content-image resolver — takes a content string, a format-
 * specific extract callback (raw queries present in the content) and a
 * rewrite callback (produce new content with resolved URLs substituted).
 *
 * Shared by `resolveHtmlImages` and `resolveSlideImages`; intended to
 * be the one-stop API for any future artifact type (docx, pdf, etc.)
 * that needs `unsplash:` resolution.
 */
export async function resolveContentImages({
  content,
  extract,
  rewrite,
}: {
  content: string
  /** Extract raw (un-normalized) query strings from the content. */
  extract: (content: string) => string[]
  /** Rewrite the content given a resolved Map keyed by NORMALIZED query. */
  rewrite: (content: string, resolved: Map<string, string>) => string
}): Promise<string> {
  const rawQueries = extract(content)
  if (rawQueries.length === 0) return content

  const uniqueQueries = [...new Set(rawQueries.map(normalize))]
  const resolved = await resolveUnsplashQueries(uniqueQueries)

  return rewrite(content, resolved)
}

/**
 * Resolve all `unsplash:keyword` URLs in HTML content to real Unsplash photos.
 * Falls back to placehold.co if Unsplash is unavailable.
 */
export async function resolveHtmlImages(content: string): Promise<string> {
  return resolveContentImages({
    content,
    extract: (c) => [...c.matchAll(UNSPLASH_REGEX)].map((m) => m[1]),
    rewrite: (c, resolved) =>
      c.replace(UNSPLASH_REGEX, (_, rawQuery) => {
        const url = resolved.get(normalize(rawQuery)) ?? fallbackUrl(rawQuery)
        return `src="${url}"`
      }),
  })
}

/** Slide type for resolver (minimal fields we need) */
interface SlideForResolver {
  imageUrl?: string
  backgroundImage?: string
  quoteImage?: string
  gallery?: Array<{ imageUrl?: string; caption?: string }>
}

interface SlidesJson {
  slides?: SlideForResolver[]
}

/** Parse slides JSON; null if it isn't a slides document we can walk. */
function parseSlidesJson(content: string): SlidesJson | null {
  try {
    const data = JSON.parse(content) as SlidesJson
    if (!data.slides || !Array.isArray(data.slides)) return null
    return data
  } catch {
    return null
  }
}

/** Collect all unsplash:* URLs from the slide image fields. */
function collectSlideUnsplashQueries(data: SlidesJson): string[] {
  const queries: string[] = []
  for (const slide of data.slides ?? []) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      queries.push(slide.imageUrl.slice(9))
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      queries.push(slide.backgroundImage.slice(9))
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      queries.push(slide.quoteImage.slice(9))
    }
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          queries.push(item.imageUrl.slice(9))
        }
      }
    }
  }
  return queries
}

/** Rewrite each unsplash:* field in-place on the parsed JSON. */
function rewriteSlideUnsplashFields(
  data: SlidesJson,
  resolved: Map<string, string>,
): void {
  const resolve = (raw: string): string => {
    const query = normalize(raw.slice(9))
    return resolved.get(query) ?? fallbackUrl(raw.slice(9))
  }
  for (const slide of data.slides ?? []) {
    if (slide.imageUrl?.startsWith("unsplash:")) {
      slide.imageUrl = resolve(slide.imageUrl)
    }
    if (slide.backgroundImage?.startsWith("unsplash:")) {
      slide.backgroundImage = resolve(slide.backgroundImage)
    }
    if (slide.quoteImage?.startsWith("unsplash:")) {
      slide.quoteImage = resolve(slide.quoteImage)
    }
    if (slide.gallery && Array.isArray(slide.gallery)) {
      for (const item of slide.gallery) {
        if (item.imageUrl?.startsWith("unsplash:")) {
          item.imageUrl = resolve(item.imageUrl)
        }
      }
    }
  }
}

/**
 * Resolve `unsplash:keyword` URLs embedded in markdown image syntax
 * `![alt](unsplash:keyword)` or `![alt](unsplash:keyword "title")`.
 *
 * Used by `application/document` artifacts where image references live
 * inline in markdown. HTML `src="..."` shape goes through
 * `resolveHtmlImages` instead; these two regexes are disjoint so they
 * don't step on each other if the document content happens to contain
 * raw HTML image tags.
 */
export async function resolveDocumentImages(content: string): Promise<string> {
  return resolveContentImages({
    content,
    extract: (c) => [...c.matchAll(UNSPLASH_MARKDOWN_REGEX)].map((m) => m[2]),
    rewrite: (c, resolved) =>
      c.replace(
        UNSPLASH_MARKDOWN_REGEX,
        (_, alt: string, rawQuery: string, titleSuffix: string | undefined) => {
          const url = resolved.get(normalize(rawQuery)) ?? fallbackUrl(rawQuery)
          return `![${alt}](${url}${titleSuffix ?? ""})`
        },
      ),
  })
}

/**
 * Resolve `unsplash:keyword` URLs in slides JSON content.
 * Handles: imageUrl, backgroundImage, quoteImage, gallery[].imageUrl
 */
export async function resolveSlideImages(content: string): Promise<string> {
  return resolveContentImages({
    content,
    extract: (c) => {
      const data = parseSlidesJson(c)
      return data ? collectSlideUnsplashQueries(data) : []
    },
    rewrite: (c, resolved) => {
      const data = parseSlidesJson(c)
      if (!data) return c
      rewriteSlideUnsplashFields(data, resolved)
      return JSON.stringify(data)
    },
  })
}

/**
 * Resolve a list of normalized queries to URLs (cache-first, Unsplash-second,
 * placeholder-fallback). Exported so other artifact types can reuse the
 * cache+lookup core without re-implementing it.
 */
export async function resolveUnsplashQueries(
  queries: string[],
): Promise<Map<string, string>> {
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
    }),
  )

  return resolved
}
