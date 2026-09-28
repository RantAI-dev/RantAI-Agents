/**
 * Fact / preference key normalization.
 *
 * The model writes free-form labels ("base", "Kota", "warna-favorit", "favorite color").
 * Merging on the raw label meant "base: Bandung" never replaced "location: Depok" and
 * "favorite_color: green" (preference) sat next to "warna_favorit: blue" (fact) — QA
 * CHAT-021 / CHAT-023. Every merge, conflict check and forget goes through
 * `normalizeMemoryKey` so those collapse onto one canonical key.
 */

/** Synonyms -> canonical key. Keys here are already in normalized form (lowercase, `_`). */
const KEY_SYNONYMS: Record<string, string> = {
  // location / residence (single-valued: where the user is based *now*)
  base: 'location',
  basis: 'location',
  based_in: 'location',
  home_base: 'location',
  city: 'location',
  current_city: 'location',
  home_city: 'location',
  kota: 'location',
  kota_tinggal: 'location',
  lokasi: 'location',
  domisili: 'location',
  tempat_tinggal: 'location',
  tinggal: 'location',
  residence: 'location',
  lives_in: 'location',
  live_in: 'location',
  living_in: 'location',
  current_location: 'location',
  city_of_residence: 'location',
  // favorite color
  favourite_color: 'favorite_color',
  favorite_colour: 'favorite_color',
  favourite_colour: 'favorite_color',
  fav_color: 'favorite_color',
  color: 'favorite_color',
  colour: 'favorite_color',
  preferred_color: 'favorite_color',
  color_preference: 'favorite_color',
  warna: 'favorite_color',
  warna_favorit: 'favorite_color',
  warna_favorite: 'favorite_color',
  warna_kesukaan: 'favorite_color',
  // identity
  nama: 'name',
  full_name: 'name',
  first_name: 'name',
  nama_lengkap: 'name',
  umur: 'age',
  usia: 'age',
  job: 'occupation',
  profession: 'occupation',
  pekerjaan: 'occupation',
  profesi: 'occupation',
  kerja: 'occupation',
  role: 'occupation',
  job_title: 'occupation',
  // plural multi-value keys -> singular
  hobbies: 'hobby',
  hobi: 'hobby',
  skills: 'skill',
  keahlian: 'skill',
  languages: 'language',
  bahasa: 'language',
  interests: 'interest',
  minat: 'interest',
}

/**
 * Predicates that can genuinely hold several values at once. Everything else is
 * single-valued: a new value REPLACES the old one (latest wins).
 * `location` and `preference` used to be here, which is why "base: Bandung" was
 * appended next to "Depok" instead of replacing it.
 */
export const MULTI_VALUE_PREDICATES: ReadonlySet<string> = new Set([
  'interest',
  'language',
  'skill',
  'hobby',
  'visited',
  'allergy',
  'pet',
])

/** Lowercase, trim, spaces/dashes/dots -> `_`, collapse repeats, apply synonyms. */
export function normalizeMemoryKey(raw: string | null | undefined): string {
  if (!raw) return 'unknown'
  const base = String(raw)
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[\s\-./]+/g, '_')
    .replace(/[^\p{L}\p{N}_]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
  if (!base) return 'unknown'
  return KEY_SYNONYMS[base] ?? base
}

export function isMultiValuePredicate(predicate: string): boolean {
  return MULTI_VALUE_PREDICATES.has(normalizeMemoryKey(predicate))
}

/**
 * Does a stored key match a forget-request key? Exact canonical match, or every token
 * of the request key appears in the stored key ("location" matches "work_location",
 * "color" -> favorite_color matches "favorite_color").
 */
export function memoryKeyMatches(storedKey: string, requestKey: string): boolean {
  const stored = normalizeMemoryKey(storedKey)
  const req = normalizeMemoryKey(requestKey)
  if (stored === 'unknown' || req === 'unknown') return false
  if (stored === req) return true
  const storedTokens = new Set(stored.split('_'))
  return req.split('_').every((t) => t.length > 0 && storedTokens.has(t))
}

/** Case-insensitive "value mentions keyword" check. Keywords under 2 chars never match. */
export function memoryValueMatches(value: string | null | undefined, keyword: string): boolean {
  if (!value) return false
  const kw = keyword.trim().toLowerCase()
  if (kw.length < 2) return false
  return String(value).toLowerCase().includes(kw)
}
