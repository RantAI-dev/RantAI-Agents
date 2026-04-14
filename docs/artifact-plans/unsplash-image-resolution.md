# Phase 6: Contextual Image Resolution via Unsplash

## Context

Model non-Gemini (Claude, GPT, dll via OpenRouter) tidak bisa generate gambar. Saat diminta buat landing page restaurant ramen, mereka hanya pakai emoji atau placeholder kosong — hasilnya terlihat tidak profesional.

Gemini bisa menampilkan gambar kontekstual karena ia "hafal" URL publik dari training data-nya. Pendekatan itu tidak reliable (URL bisa 404, rate-limited, stale).

**Solusi**: server-side image resolution via Unsplash API. LLM cuma perlu signal "saya mau gambar tentang X" via URL scheme khusus. Server resolve ke foto Unsplash asli sebelum artifact dipersist. Works untuk **semua model** — tidak bergantung pada capability spesifik model.

### Benefit

- Gambar **kontekstual** (foto ramen untuk restaurant ramen, foto office untuk SaaS landing page, dll)
- **Konsisten** — semua model bisa akses, bukan privilege Gemini saja
- **Reliable** — Unsplash URL stabil, tidak akan 404
- **Free tier cukup** — 50 req/jam demo → 5000/jam setelah production approval
- **Cacheable** — keyword yang sama tidak hit API ulang

---

## Contract: LLM-facing URL Scheme

LLM menulis gambar dengan prefix `unsplash:` di `src`:

```html
<!-- HTML & React -->
<img src="unsplash:ramen bowl" alt="Bowl of fresh ramen" class="w-full h-64 object-cover rounded-xl">
<img src="unsplash:japanese restaurant interior" alt="...">
<img src="unsplash:chef kitchen" alt="...">

<!-- Markdown -->
![Fresh ramen bowl](unsplash:ramen bowl)
![Japanese restaurant](unsplash:japanese restaurant)
```

Keywords boleh multi-kata (space atau comma). Max ~50 karakter. Case-insensitive.

**Kenapa URL scheme, bukan attribute (`data-query`)?**

Pakai URL scheme (`unsplash:...`) bekerja **sama persis** di HTML, React (JSX), dan Markdown. Cuma ganti string di `src` / `![](...)`. Tidak butuh attribute custom yang harus diajarkan per-format.

---

## Architecture

```
LLM generates content with unsplash: URLs
         ↓
create_artifact / update_artifact tool execution
         ↓
validateArtifactContent() ✓
         ↓
★ resolveArtifactImages(content, type)
   ├─ Scan for unsplash: URLs (regex per format)
   ├─ Dedupe queries
   ├─ For each query:
   │    ├─ Check Prisma ResolvedImage cache (TTL 30d)
   │    ├─ If miss → Unsplash API call
   │    │    ├─ Success → cache + return URL
   │    │    └─ Fail → fallback to picsum.photos/{w}/{h}?random={hash(query)}
   │    └─ Return {query → {url, attribution}}
   └─ Replace all unsplash: occurrences with real URLs
         ↓
uploadFile() → S3 (content has real URLs now)
         ↓
prisma.document.create | update
         ↓
Fire-and-forget RAG indexing (with real URLs)
```

**Key design choice**: resolution happens **once**, pre-persist. No per-render API calls. Content in S3 and DB is already resolved.

---

## Files to Modify / Create

| File | Type | Purpose |
|------|------|---------|
| `src/lib/unsplash/client.ts` | **New** | Unsplash API wrapper with retries + timeout |
| `src/lib/unsplash/types.ts` | **New** | Response types |
| `src/lib/unsplash/image-resolver.ts` | **New** | High-level resolver: cache + fallback orchestration |
| `src/lib/unsplash/__tests__/image-resolver.test.ts` | **New** | Unit tests with fetch mocks |
| `prisma/schema.prisma` | Modify | Add `ResolvedImage` model |
| `src/lib/tools/builtin/create-artifact.ts` | Modify | Call resolver pre-upload for HTML/React/Markdown |
| `src/lib/tools/builtin/update-artifact.ts` | Modify | Same integration |
| `src/lib/prompts/artifacts/html.ts` | Modify | Document `unsplash:` URL scheme |
| `src/lib/prompts/artifacts/react.ts` | Modify | Same |
| `src/lib/prompts/artifacts/markdown.ts` | Modify | Same |
| `.env.example` | Modify | Add `UNSPLASH_API_KEY` + config vars |
| `docs/ARTIFACTS.md` | Modify | Document image resolution feature |

---

## Implementation Steps

### Step 1: Prisma schema — ResolvedImage table

**File**: `prisma/schema.prisma`

```prisma
model ResolvedImage {
  id          String   @id @default(cuid())
  query       String   @unique  // normalized (lowercase, trimmed)
  url         String               // e.g. https://images.unsplash.com/photo-xxx?w=1200
  thumbUrl    String?              // smaller variant for previews
  attribution String               // "Photo by {author} on Unsplash"
  sourceUrl   String               // Unsplash page URL (for attribution link)
  createdAt   DateTime @default(now())
  expiresAt   DateTime             // now + 30 days

  @@index([expiresAt])
}
```

Run: `bun db:migrate` (dev) or `bun db:push` (if not migrating).

### Step 2: Environment variables

**File**: `.env.example`

```bash
# ============================================
# IMAGE RESOLUTION (Unsplash)
# ============================================
# Optional. Without this, `unsplash:` URLs fall back to picsum.photos.
# Get a free API key: https://unsplash.com/developers
UNSPLASH_API_KEY=""
UNSPLASH_REQUEST_TIMEOUT_MS="5000"
UNSPLASH_CACHE_TTL_DAYS="30"
```

### Step 3: Unsplash API client

**New file**: `src/lib/unsplash/client.ts`

Responsibilities:
- Wrap `GET https://api.unsplash.com/search/photos?query=X&per_page=1&orientation=landscape`
- Native `fetch` + `AbortSignal.timeout()` (match existing codebase pattern — see `web-search.ts`)
- Headers: `Authorization: Client-ID ${UNSPLASH_API_KEY}`, `Accept-Version: v1`
- Parse first result → `{ url, thumbUrl, attribution, sourceUrl }`
- Throw typed errors on network fail, rate limit, no results

Key Unsplash URL params to append:
- `?w=1200&q=80&fm=webp` → optimized delivery (Unsplash on-the-fly resize)

### Step 4: Resolver (main logic)

**New file**: `src/lib/unsplash/image-resolver.ts`

Two main exports:

```typescript
export async function resolveArtifactImages(
  content: string,
  type: "text/html" | "application/react" | "text/markdown"
): Promise<{ resolved: string; stats: { total: number; hits: number; fallbacks: number } }>
```

Steps:
1. Extract queries via regex (different per type):
   - HTML/React: `/src=["']unsplash:([^"']+)["']/g`
   - Markdown: `/\]\(unsplash:([^)]+)\)/g`
2. Normalize (lowercase, trim, dedupe into Set)
3. Batch resolve:
   - Prisma cache lookup via `findMany({ where: { query: { in: [...] } } })`
   - For misses: parallel Unsplash API calls with `Promise.allSettled` (limit 5 concurrent)
   - Persist new cache entries via `createMany({ skipDuplicates: true })`
4. Build `Map<query, resolvedUrl>`. For any query that failed both API + cache → deterministic picsum fallback: `https://picsum.photos/seed/{hashQuery}/1200/800`
5. String replacement in content (same regex, replace with resolved URLs)
6. Return `{ resolved, stats }` — stats for logging/debugging

Graceful degradation rules:
- No `UNSPLASH_API_KEY` → skip API entirely, all queries → picsum fallback
- Rate limit hit (header `X-Ratelimit-Remaining: 0`) → picsum fallback for remaining queries
- Individual query 404 / no results → picsum fallback for that query only

### Step 5: Integrate into create-artifact.ts

**File**: `src/lib/tools/builtin/create-artifact.ts`

Insert between `validateArtifactContent()` success and `uploadFile()` (~line 125):

```typescript
// ... existing validation ...

// Resolve unsplash: URLs to real image URLs before persist
let resolvedContent = content
if (type === "text/html" || type === "application/react" || type === "text/markdown") {
  const result = await resolveArtifactImages(content, type)
  resolvedContent = result.resolved
  // Optional: log stats for observability
  if (result.stats.total > 0) {
    console.log(`[artifact] Resolved ${result.stats.hits}/${result.stats.total} images (${result.stats.fallbacks} fallbacks)`)
  }
}

await uploadFile(s3Key, Buffer.from(resolvedContent, "utf-8"), mimeType)
// Use resolvedContent for prisma.document.create too
```

### Step 6: Integrate into update-artifact.ts

Same pattern, same insertion point. Use `existingArtifact.artifactType` for the type check (not a tool arg).

### Step 7: Prompt updates

**File**: `src/lib/prompts/artifacts/html.ts`

Replace the existing "Images & Visual Assets" section:

```markdown
## Images & Visual Assets

When the design needs photos (hero, product, team, testimonials):
- **Preferred — use `src="unsplash:{keyword}"`** — server resolves to real Unsplash photo. Keywords are specific search terms:
  - `src="unsplash:ramen bowl"` for food
  - `src="unsplash:modern office interior"` for workspace
  - `src="unsplash:young professional portrait"` for testimonials
  - `src="unsplash:mountain landscape sunset"` for backgrounds
  - Use 2–5 word keywords. Be specific ("vintage leather sofa" > "sofa"). Lowercase.
- **Fallback — when you need a labeled box** (non-photo contexts): `https://placehold.co/{w}x{h}/{bg}/{fg}?text=Label`
- **Icons**: inline SVG (simple paths, not illustrations)
- Style images responsively: `class="w-full h-auto rounded-xl object-cover"` or `aspect-ratio` utility
- Always descriptive `alt` text + `loading="lazy"` for below-fold images
- NEVER use emoji as hero/product image. NEVER leave empty `<img>` or `src="#"`
```

**File**: `src/lib/prompts/artifacts/react.ts` — same content, adjusted to JSX (`className` instead of `class`, LucideReact for icons).

**File**: `src/lib/prompts/artifacts/markdown.ts` — Markdown version:

```markdown
- **Images**: `![alt](unsplash:{keyword})` — server auto-resolves to a real Unsplash photo matching the keyword. Example: `![Fresh ramen bowl](unsplash:ramen bowl)`. Fall back to `https://placehold.co/{w}x{h}?text=Label` only when a photo isn't appropriate.
```

### Step 8: Update examples in prompts

Update the `examples` array in html.ts and react.ts to use `unsplash:` URLs in at least one example, so the LLM learns by pattern.

### Step 9: Unit tests

**New file**: `src/lib/unsplash/__tests__/image-resolver.test.ts`

Test cases:
- Regex extraction: HTML `src="unsplash:foo"` → `foo`
- Regex extraction: Markdown `![x](unsplash:foo)` → `foo`
- Dedupe: same keyword 3× → 1 API call
- Cache hit: Prisma has entry → no API call
- Cache miss + API success → stored in cache + replaced
- API 404 / no results → picsum fallback
- Missing API key → picsum fallback for all
- Rate limit response → picsum fallback for remaining
- Timeout → picsum fallback + logged

Mock `global.fetch` and `prisma` via Vitest.

### Step 10: Docs update

**File**: `docs/ARTIFACTS.md`

Add new section after validation pipeline:

```markdown
## Image Resolution (HTML / React / Markdown)

Artifacts can reference contextual images via the `unsplash:` URL scheme:
- HTML/React: `<img src="unsplash:ramen bowl">`
- Markdown: `![alt](unsplash:ramen bowl)`

The `create_artifact` / `update_artifact` tools resolve these URLs to real Unsplash photos before persisting content to S3. Requires `UNSPLASH_API_KEY` env var. Without it, URLs fall back to deterministic `picsum.photos` seed URLs.

Cache: `ResolvedImage` table in Prisma, 30-day TTL, keyed by normalized query string.
```

---

## Design Decisions

### Why URL scheme instead of `data-query` attribute?

Works consistently across HTML, JSX, and Markdown — all three use the same `src` / `](...)` pattern. No need to teach the LLM a custom attribute per format.

### Why resolve pre-persist, not at render time?

- **Performance**: 1 API call per new artifact, not per render
- **Determinism**: content in S3 matches what user sees; no "image missing" flicker on re-render
- **RAG integrity**: indexed content has real URLs, not placeholder schemes
- **Offline render**: artifact still works when Unsplash is down (URLs already fetched)

### Why picsum as fallback, not Pravatar or Flickr?

Picsum is the most reliable (stable, fast, no rate limit, no API key). We lose contextuality on fallback — but graceful degradation > broken images. User can regenerate if they care.

For `unsplash:face portrait` queries specifically, we could add a second-tier fallback to Pravatar, but that's complexity for edge case.

### Why Prisma cache, not Redis / in-memory?

- Codebase has no Redis setup
- In-memory cache doesn't survive restart or work across multi-instance deploys
- Prisma adds 1 DB query but already used in the hot path
- Table is small (one row per unique query, 30-day TTL)

### Why not Gemini-style model-generated URLs?

We tried — that's what non-Gemini models can't do reliably. URLs hallucinated from training data 404 frequently.

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Unsplash API down / slow | 5s timeout + picsum fallback; parallel requests won't block each other |
| Rate limit (50/hour demo) | Cache first; parse rate limit headers; fallback after limit hit |
| Bad keyword → bad image | Unsplash search is fairly forgiving; fallback on 0 results |
| Content in S3 has stale URLs after 30d cache expiry | Unsplash URLs are stable (their infra) — cache is just to avoid re-calling API, URLs themselves don't expire |
| User wants specific image, not random first result | Future: allow `unsplash:{query}#{index}` syntax to pick Nth result. Ship without this first. |
| Cost | Free tier is enough for dev. Production upgrade is free (5000/hr after approval from Unsplash) |
| Privacy: query strings include user content | Queries are short keywords, not user-sensitive data. Document in privacy notice. |

---

## Verification

1. Set `UNSPLASH_API_KEY` in `.env`, run migration for `ResolvedImage`
2. `bun dev` → buka chat → minta "landing page restaurant ramen" → HTML artifact muncul dengan foto ramen asli (bukan emoji / placeholder)
3. Minta artifact lain dengan keyword yang sama → second request hit cache (log: `hits: N, fallbacks: 0`)
4. Delete `UNSPLASH_API_KEY` → restart → HTML artifact tetap render, tapi pakai picsum (graceful degradation)
5. `bun test src/lib/unsplash` → semua unit test pass
6. Inspect S3 object untuk artifact — URL-nya sudah `https://images.unsplash.com/...`, bukan `unsplash:...`

---

## Phased Rollout

**Ship Phase 1** (MVP, ~1 day):
- Steps 1-6: Schema, client, resolver, integration. HTML only.

**Phase 2** (~2 hours):
- Step 7-8: Prompt updates + React + Markdown support

**Phase 3** (~2 hours):
- Step 9: Unit tests
- Step 10: Docs

**Future enhancements** (out of scope for this plan):
- `unsplash:{query}#{index}` for picking Nth search result
- Image optimization / resizing server-side (instead of Unsplash's built-in `w=`)
- Admin dashboard: view cache hit rate, top queries
- Pravatar / face-specific fallback for portrait queries
- Per-org rate limit tracking
