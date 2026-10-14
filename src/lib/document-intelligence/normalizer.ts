/**
 * Document Intelligence Entity Normalizer (TC-998)
 *
 * Normalizes extracted entity types to a canonical set, detects jabatan/roles,
 * drops trivial entity fragments and stopwords, and deduplicates entities.
 */

export const CANONICAL_ENTITY_TYPES = [
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "DATE",
  "EVENT",
  "CONCEPT",
  "PRODUCT",
  "REGULATION",
  "DOCUMENT",
  "ROLE",
  "TECHNOLOGY",
  "MONEY",
  "EMAIL",
  "URL",
  "PHONE",
  "OTHER",
] as const

export type CanonicalEntityType = (typeof CANONICAL_ENTITY_TYPES)[number]

export interface ExtractedEntity {
  name: string
  type: string
  confidence?: number
}

const TYPE_ALIASES: Record<string, CanonicalEntityType> = {
  // Organization aliases
  ORG: "ORGANIZATION",
  ORGANIZATION: "ORGANIZATION",
  ORGANISATION: "ORGANIZATION",
  COMPANY: "ORGANIZATION",
  INSTITUTION: "ORGANIZATION",
  CORP: "ORGANIZATION",
  CORPORATION: "ORGANIZATION",
  ENTERPRISE: "ORGANIZATION",
  DIVISI: "ORGANIZATION",
  DIVISION: "ORGANIZATION",
  DEPARTMENT: "ORGANIZATION",
  AGENCY: "ORGANIZATION",
  MINISTRY: "ORGANIZATION",
  LEMBAGA: "ORGANIZATION",

  // Person aliases
  PERSON: "PERSON",
  PER: "PERSON",
  PEOPLE: "PERSON",
  HUMAN: "PERSON",
  INDIVIDUAL: "PERSON",

  // Location aliases
  LOCATION: "LOCATION",
  LOC: "LOCATION",
  GPE: "LOCATION",
  CITY: "LOCATION",
  COUNTRY: "LOCATION",
  PLACE: "LOCATION",
  ADDRESS: "LOCATION",
  PROVINCE: "LOCATION",
  KOTA: "LOCATION",
  NEGARA: "LOCATION",

  // Date aliases
  DATE: "DATE",
  DATETIME: "DATE",
  TIME: "DATE",
  YEAR: "DATE",
  PERIOD: "DATE",
  TAHUN: "DATE",

  // Event aliases
  EVENT: "EVENT",
  INCIDENT: "EVENT",
  MEETING: "EVENT",
  CONFERENCE: "EVENT",
  ACARA: "EVENT",

  // Concept aliases
  CONCEPT: "CONCEPT",
  IDEA: "CONCEPT",
  TERM: "CONCEPT",
  METRIC: "CONCEPT",
  TOPIC: "CONCEPT",
  CATEGORY: "CONCEPT",

  // Product aliases
  PRODUCT: "PRODUCT",
  SERVICE: "PRODUCT",
  ITEM: "PRODUCT",
  GOODS: "PRODUCT",
  PRODUK: "PRODUCT",
  LAYANAN: "PRODUCT",

  // Regulation aliases
  REGULATION: "REGULATION",
  LAW: "REGULATION",
  POLICY: "REGULATION",
  ACT: "REGULATION",
  RULE: "REGULATION",
  STANDARD: "REGULATION",
  UU: "REGULATION",
  PERATURAN: "REGULATION",
  KEPPRES: "REGULATION",
  PERMEN: "REGULATION",

  // Document aliases
  DOCUMENT: "DOCUMENT",
  DOC: "DOCUMENT",
  FILE: "DOCUMENT",
  CODE: "DOCUMENT",
  REPORT: "DOCUMENT",
  DOKUMEN: "DOCUMENT",

  // Role / Jabatan aliases
  ROLE: "ROLE",
  POSITION: "ROLE",
  JOB_TITLE: "ROLE",
  TITLE: "ROLE",
  OCCUPATION: "ROLE",
  PROFESSION: "ROLE",
  JABATAN: "ROLE",
  POSISI: "ROLE",

  // Technology aliases
  TECHNOLOGY: "TECHNOLOGY",
  TECH: "TECHNOLOGY",

  // Money / Currency aliases
  MONEY: "MONEY",
  CURRENCY: "MONEY",

  // Contact aliases
  EMAIL: "EMAIL",
  E_MAIL: "EMAIL",
  MAIL: "EMAIL",
  URL: "URL",
  URI: "URL",
  LINK: "URL",
  WEBSITE: "URL",
  PHONE: "PHONE",
  TELEPHONE: "PHONE",
  TEL: "PHONE",
  MOBILE: "PHONE",

  // Other
  OTHER: "OTHER",
  MISC: "OTHER",
  UNKNOWN: "OTHER",
  NUMBER: "OTHER",
}

const JABATAN_REGEX =
  /^(direktur(\s+utama|\s+keuangan|\s+operasional|\s+teknik|\s+sdm)?|dirut|komisaris(\s+utama)?|manajer|manager|kepala(\s+divisi|\s+bagian|\s+seksi|\s+biro)?|ketua|menteri|wakil(\s+menteri|\s+ketua|\s+direktur|\s+presiden)?|sekretaris|bendahara|ceo|cto|cfo|coo|cmo|cso|vp|president(\s+director)?|head\s+of\b.*|lead\b.*|chief\b.*|officer|supervisor|staf|staff|pegawai|specialist|analyst|coordinator|koordinator|engineer|auditor|peneliti|developer|designer)$/i

const STOPWORDS = new Set([
  // Indonesian
  "dan", "atau", "yang", "untuk", "pada", "dari", "dalam", "dengan", "oleh", "atas",
  "adalah", "sebagai", "ini", "itu", "juga", "akan", "telah", "bisa", "dapat", "bagi",
  "tentang", "serta", "karena", "antara", "hanya", "secara", "sudah", "kami", "kita",
  "mereka", "anda", "saya", "kamu", "dia", "saat", "lain", "bila", "jika", "maka",
  "agar", "supaya", "pun", "ke", "di",
  // English
  "the", "and", "or", "for", "with", "from", "that", "this", "these", "those",
  "have", "has", "had", "not", "but", "are", "were", "been", "their", "them",
  "they", "its", "into", "onto", "over", "such", "than", "then", "very", "also",
  "just", "only", "about", "other", "some", "any", "all", "each",
])

// Generic single-word company fragments when classified as OTHER
const GENERIC_OTHER_FRAGMENTS = new Set([
  "digital", "utama", "global", "mandiri", "jaya", "abadi",
  "group", "corp", "corporation", "management", "international", "general", "national",
  "solution", "solutions", "teknologi", "technology", "systems", "system",
])

/**
 * Maps any raw entity type string to a canonical entity type.
 * Also reclassifies jabatan/positions to ROLE if originally labelled PERSON or OTHER.
 */
export function normalizeEntityType(
  rawType: string,
  entityName?: string
): CanonicalEntityType {
  const upper = (rawType || "").trim().toUpperCase()

  // First check if entityName indicates a jabatan/role when labelled PERSON or OTHER
  if (
    entityName &&
    (upper === "PERSON" || upper === "PER" || upper === "OTHER" || upper === "MISC" || !upper)
  ) {
    const cleanName = entityName.trim()
    if (JABATAN_REGEX.test(cleanName)) {
      return "ROLE"
    }
  }

  // Look up mapped alias
  if (TYPE_ALIASES[upper]) {
    return TYPE_ALIASES[upper]
  }

  return "OTHER"
}

/**
 * Returns true if an entity is trivial (e.g. length < 3, pure stopword, or generic company fragment).
 */
export function isTrivialEntity(name: string, type?: string): boolean {
  if (!name || typeof name !== "string") return true
  const clean = name.trim()
  if (clean.length < 2) return true
  if (clean.length === 2 && !/^[A-Z0-9]{2}$/.test(clean)) return true

  // Pure non-alphanumeric or numbers under 3 chars
  if (!/[a-zA-Z0-9]/.test(clean)) return true

  const lower = clean.toLowerCase()
  if (lower === "null" || lower === "undefined") return true

  // Single word stopwords
  if (STOPWORDS.has(lower)) return true

  // Generic single-word fragment labelled OTHER
  const normalizedType = type ? normalizeEntityType(type, name) : "OTHER"
  if (normalizedType === "OTHER" && GENERIC_OTHER_FRAGMENTS.has(lower)) {
    return true
  }

  return false
}

/**
 * Normalizes entity types, drops trivial entities, and deduplicates by type:name (case-insensitive),
 * retaining the entity with the highest confidence.
 */
export function normalizeEntities<T extends ExtractedEntity>(entities: T[]): T[] {
  const seen = new Map<string, T>()

  for (const entity of entities) {
    if (!entity.name || typeof entity.name !== "string") continue

    const name = entity.name.trim()
    const type = normalizeEntityType(entity.type, name)

    if (isTrivialEntity(name, type)) {
      continue
    }

    const key = `${type}:${name.toLowerCase()}`
    const existing = seen.get(key)
    const confidence = typeof entity.confidence === "number" ? entity.confidence : 0.8

    if (!existing) {
      seen.set(key, {
        ...entity,
        name,
        type,
        confidence,
      })
    } else {
      const existingConfidence =
        typeof existing.confidence === "number" ? existing.confidence : 0.8
      if (confidence > existingConfidence) {
        seen.set(key, {
          ...existing,
          ...entity,
          name,
          type,
          confidence,
        })
      }
    }
  }

  return Array.from(seen.values())
}
