# Unsplash Image Resolution for HTML Artifacts

## Problem

Non-Gemini models can't generate contextual images. Landing pages end up with emoji or empty `src=""`.

## Solution

LLM writes `src="unsplash:keyword"` → server resolves to real Unsplash photo before persist.

```html
<!-- LLM writes -->
<img src="unsplash:ramen bowl" alt="Fresh ramen">

<!-- Server resolves to -->
<img src="https://images.unsplash.com/photo-xxx?w=1200" alt="Fresh ramen">

<!-- If Unsplash fails -->
<img src="https://placehold.co/1200x800/f1f5f9/64748b?text=ramen%20bowl" alt="Fresh ramen">
```

---

## New Files

```
src/lib/unsplash/
├── types.ts        # TypeScript types
├── client.ts       # Unsplash API client
├── resolver.ts     # Core resolution logic
└── index.ts        # Safe wrapper (main export)
```

---

## Existing File Changes

### 1. `prisma/schema.prisma`

```prisma
model ResolvedImage {
  id          String   @id @default(cuid())
  query       String   @unique
  url         String
  attribution String
  createdAt   DateTime @default(now())
  expiresAt   DateTime
  @@index([expiresAt])
}
```

### 2. `.env.example`

```bash
UNSPLASH_API_KEY=""
```

### 3. `create-artifact.ts` (+3 lines)

```diff
+ import { resolveImages } from "@/lib/unsplash"

  // Inside try block, before uploadFile (~line 140):
+ const finalContent = type === "text/html" ? await resolveImages(content) : content

- await uploadFile(s3Key, Buffer.from(content, "utf-8"), mimeType)
+ await uploadFile(s3Key, Buffer.from(finalContent, "utf-8"), mimeType)

- content,
+ content: finalContent,
```

### 4. `update-artifact.ts` (+3 lines)

```diff
+ import { resolveImages } from "@/lib/unsplash"

  // After validation, before archive (~line 90):
+ const finalContent = existing.artifactType === "text/html" ? await resolveImages(content) : content

- await uploadFile(existing.s3Key, Buffer.from(content, "utf-8"), ...)
+ await uploadFile(existing.s3Key, Buffer.from(finalContent, "utf-8"), ...)

- content,
+ content: finalContent,
```

### 5. `html.ts` prompt — add to rules

```markdown
## Images

Use `src="unsplash:{keyword}"` for photos:
- `src="unsplash:ramen bowl"` — food
- `src="unsplash:modern office interior"` — workspace
- `src="unsplash:woman portrait smiling"` — testimonials

Keywords: 2-5 words, specific, lowercase.
```

---

## Implementation

### `src/lib/unsplash/types.ts`

```typescript
export interface UnsplashPhoto {
  urls: { regular: string }
  user: { name: string }
}

export interface UnsplashResponse {
  results: UnsplashPhoto[]
}
```

### `src/lib/unsplash/client.ts`

```typescript
import type { UnsplashPhoto } from './types'

const API_URL = 'https://api.unsplash.com/search/photos'
const TIMEOUT_MS = 5000

export async function searchPhoto(query: string): Promise<UnsplashPhoto | null> {
  const key = process.env.UNSPLASH_API_KEY
  if (!key) return null

  try {
    const url = `${API_URL}?query=${encodeURIComponent(query)}&per_page=1`
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${key}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })

    if (!res.ok) return null

    const data = await res.json()
    return data.results?.[0] ?? null
  } catch {
    return null
  }
}
```

### `src/lib/unsplash/resolver.ts`

```typescript
import { prisma } from '@/lib/prisma'
import { searchPhoto } from './client'

const REGEX = /src=["']unsplash:([^"']+)["']/gi
const CACHE_DAYS = 30

function normalize(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 50)
}

function fallbackUrl(query: string): string {
  return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encodeURIComponent(query)}`
}

export async function resolveHtmlImages(content: string): Promise<string> {
  const matches = [...content.matchAll(REGEX)]
  if (!matches.length) return content

  const queries = [...new Set(matches.map(m => normalize(m[1])))]
  const resolved = new Map<string, string>()

  // 1. Check cache
  const cached = await prisma.resolvedImage.findMany({
    where: { query: { in: queries } },
  })
  cached.forEach(c => resolved.set(c.query, c.url))

  // 2. Fetch uncached (parallel)
  const uncached = queries.filter(q => !resolved.has(q))
  await Promise.all(
    uncached.map(async query => {
      const photo = await searchPhoto(query)

      if (photo) {
        const url = `${photo.urls.regular}&w=1200`
        resolved.set(query, url)

        // Cache result
        await prisma.resolvedImage.create({
          data: {
            query,
            url,
            attribution: `Photo by ${photo.user.name} on Unsplash`,
            expiresAt: new Date(Date.now() + CACHE_DAYS * 24 * 60 * 60 * 1000),
          },
        }).catch(() => {}) // Ignore duplicate
      } else {
        resolved.set(query, fallbackUrl(query))
      }
    })
  )

  // 3. Replace in content
  return content.replace(REGEX, (_, q) => {
    const url = resolved.get(normalize(q)) ?? fallbackUrl(q)
    return `src="${url}"`
  })
}
```

### `src/lib/unsplash/index.ts`

```typescript
import { resolveHtmlImages } from './resolver'

const ENABLED = true // Feature flag

/**
 * Safe wrapper - NEVER throws, always returns valid content.
 */
export async function resolveImages(content: string): Promise<string> {
  if (!ENABLED) return content

  try {
    return await resolveHtmlImages(content)
  } catch (err) {
    console.error('[unsplash] Resolution failed:', err)
    return content
  }
}
```

---

## Verification

```bash
# 1. Migration
bun db:push

# 2. Set API key
echo 'UNSPLASH_API_KEY="your-key"' >> .env

# 3. Test
bun dev
# → Request "landing page for ramen restaurant"
# → Verify images are real Unsplash photos

# 4. Test fallback (remove API key)
# → Images show placehold.co with keyword text

# 5. Check cache
SELECT * FROM "ResolvedImage";
```

---

## Rollback

```typescript
// Option 1: Feature flag (instant)
const ENABLED = false

// Option 2: Remove imports (2 files × 3 lines)
```

---

## Summary

| Aspect | Value |
|--------|-------|
| New files | 4 |
| Lines changed per existing file | 3 |
| Primary source | Unsplash |
| Fallback | placehold.co with keyword text |
| Cache | Prisma, 30 days |
| Risk | None (try-catch, feature flag) |
