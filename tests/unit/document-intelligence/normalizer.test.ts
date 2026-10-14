import { describe, it, expect } from "vitest"
import {
  normalizeEntityType,
  isTrivialEntity,
  normalizeEntities,
  type ExtractedEntity,
} from "@/lib/document-intelligence/normalizer"

describe("Document Intelligence Entity Normalizer (TC-998)", () => {
  describe("normalizeEntityType", () => {
    it("maps common abbreviations to canonical types", () => {
      expect(normalizeEntityType("ORG")).toBe("ORGANIZATION")
      expect(normalizeEntityType("PER")).toBe("PERSON")
      expect(normalizeEntityType("LOC")).toBe("LOCATION")
      expect(normalizeEntityType("DOC")).toBe("DOCUMENT")
      expect(normalizeEntityType("LAW")).toBe("REGULATION")
      expect(normalizeEntityType("POSITION")).toBe("ROLE")
      expect(normalizeEntityType("JABATAN")).toBe("ROLE")
    })

    it("reclassifies jabatan to ROLE when labelled PERSON or OTHER", () => {
      expect(normalizeEntityType("PERSON", "Direktur Utama")).toBe("ROLE")
      expect(normalizeEntityType("OTHER", "Direktur Utama")).toBe("ROLE")
      expect(normalizeEntityType("OTHER", "CEO")).toBe("ROLE")
      expect(normalizeEntityType("PERSON", "Kepala Divisi")).toBe("ROLE")
      expect(normalizeEntityType("PERSON", "Komisaris")).toBe("ROLE")
      expect(normalizeEntityType("PERSON", "Manager")).toBe("ROLE")
    })

    it("preserves actual person names as PERSON", () => {
      expect(normalizeEntityType("PERSON", "Rangga Wiratama")).toBe("PERSON")
      expect(normalizeEntityType("PER", "Budi Santoso")).toBe("PERSON")
      expect(normalizeEntityType("PERSON", "John Doe")).toBe("PERSON")
    })

    it("maps pattern extractor and technical types to canonical types or OTHER", () => {
      expect(normalizeEntityType("Technology")).toBe("TECHNOLOGY")
      expect(normalizeEntityType("TECHNOLOGY")).toBe("TECHNOLOGY")
      expect(normalizeEntityType("TECH")).toBe("TECHNOLOGY")
      expect(normalizeEntityType("Email")).toBe("EMAIL")
      expect(normalizeEntityType("EMAIL")).toBe("EMAIL")
      expect(normalizeEntityType("URL")).toBe("URL")
      expect(normalizeEntityType("Phone")).toBe("PHONE")
      expect(normalizeEntityType("PHONE")).toBe("PHONE")
      expect(normalizeEntityType("Currency")).toBe("MONEY")
      expect(normalizeEntityType("CURRENCY")).toBe("MONEY")
      expect(normalizeEntityType("Money")).toBe("MONEY")
      expect(normalizeEntityType("MONEY")).toBe("MONEY")
      expect(normalizeEntityType("Number")).toBe("OTHER")
      expect(normalizeEntityType("NUMBER")).toBe("OTHER")
    })

    it("falls back to OTHER for unrecognized types", () => {
      expect(normalizeEntityType("UNKNOWN_TYPE")).toBe("OTHER")
      expect(normalizeEntityType("")).toBe("OTHER")
    })
  })

  describe("isTrivialEntity", () => {
    it("flags length < 2 and non-acronym 2-letter fragments as trivial, but keeps 2-letter uppercase/alphanumeric acronyms", () => {
      // Kept: 2-char uppercase/alphanumeric acronyms
      expect(isTrivialEntity("UU", "REGULATION")).toBe(false)
      expect(isTrivialEntity("BI", "ORGANIZATION")).toBe(false)
      expect(isTrivialEntity("AI", "CONCEPT")).toBe(false)
      expect(isTrivialEntity("HR", "ROLE")).toBe(false)
      expect(isTrivialEntity("PT", "ORGANIZATION")).toBe(false)
      expect(isTrivialEntity("KB", "CONCEPT")).toBe(false)
      expect(isTrivialEntity("TV", "PRODUCT")).toBe(false)
      expect(isTrivialEntity("5G", "TECHNOLOGY")).toBe(false)

      // Dropped: length < 2 or lowercase 2-letter fragments
      expect(isTrivialEntity("x", "OTHER")).toBe(true)
      expect(isTrivialEntity("a", "PERSON")).toBe(true)
      expect(isTrivialEntity("  x  ", "CONCEPT")).toBe(true)
      expect(isTrivialEntity("di", "OTHER")).toBe(true)
      expect(isTrivialEntity("ab", "OTHER")).toBe(true)
      expect(isTrivialEntity("ke", "OTHER")).toBe(true)
    })

    it("flags stopwords as trivial", () => {
      expect(isTrivialEntity("dan", "OTHER")).toBe(true)
      expect(isTrivialEntity("yang", "OTHER")).toBe(true)
      expect(isTrivialEntity("the", "OTHER")).toBe(true)
      expect(isTrivialEntity("untuk", "OTHER")).toBe(true)
      expect(isTrivialEntity("with", "OTHER")).toBe(true)
    })

    it("flags generic single-word company fragments labelled OTHER as trivial", () => {
      expect(isTrivialEntity("Digital", "OTHER")).toBe(true)
      expect(isTrivialEntity("Global", "OTHER")).toBe(true)
      expect(isTrivialEntity("Utama", "OTHER")).toBe(true)
      expect(isTrivialEntity("Mandiri", "OTHER")).toBe(true)
    })

    it("preserves proper names like Indonesia and Nusantara even when labelled OTHER", () => {
      expect(isTrivialEntity("Indonesia", "OTHER")).toBe(false)
      expect(isTrivialEntity("Nusantara", "OTHER")).toBe(false)
      expect(isTrivialEntity("indonesia", "OTHER")).toBe(false)
      expect(isTrivialEntity("nusantara", "OTHER")).toBe(false)
    })

    it("preserves valid meaningful entities", () => {
      expect(isTrivialEntity("PT Sinar Nusantara Digital", "ORGANIZATION")).toBe(false)
      expect(isTrivialEntity("Direktur Utama", "ROLE")).toBe(false)
      expect(isTrivialEntity("Jakarta", "LOCATION")).toBe(false)
      expect(isTrivialEntity("2026", "DATE")).toBe(false)
      expect(isTrivialEntity("AI Platform", "CONCEPT")).toBe(false)
      expect(isTrivialEntity("contact@example.com", "EMAIL")).toBe(false)
      expect(isTrivialEntity("https://example.com", "URL")).toBe(false)
      expect(isTrivialEntity("+62812345678", "PHONE")).toBe(false)
      expect(isTrivialEntity("Rp 50.000.000", "MONEY")).toBe(false)
    })
  })

  describe("normalizeEntities", () => {
    it("normalizes entity types, drops trivial fragments, and deduplicates", () => {
      const rawEntities: ExtractedEntity[] = [
        { name: "PT Sinar Nusantara Digital", type: "ORG", confidence: 0.95 },
        { name: "Direktur Utama", type: "PERSON", confidence: 0.8 },
        { name: "Digital", type: "OTHER", confidence: 0.8 }, // trivial fragment -> drop
        { name: "dan", type: "OTHER", confidence: 0.9 }, // stopword -> drop
        { name: "ab", type: "CONCEPT", confidence: 0.9 }, // lowercase 2 chars -> drop
        { name: "UU", type: "LAW", confidence: 0.9 }, // 2-char uppercase acronym -> keep as REGULATION
        { name: "Indonesia", type: "OTHER", confidence: 0.85 }, // country preserved despite OTHER
        { name: "pt sinar nusantara digital", type: "ORGANIZATION", confidence: 0.98 }, // duplicate with higher confidence
      ]

      const normalized = normalizeEntities(rawEntities)

      expect(normalized).toHaveLength(4)

      const org = normalized.find((e) => e.type === "ORGANIZATION")
      expect(org).toBeDefined()
      expect(org?.confidence).toBe(0.98)

      const role = normalized.find((e) => e.type === "ROLE")
      expect(role).toBeDefined()
      expect(role?.name).toBe("Direktur Utama")

      const reg = normalized.find((e) => e.type === "REGULATION")
      expect(reg).toBeDefined()
      expect(reg?.name).toBe("UU")

      const country = normalized.find((e) => e.name === "Indonesia")
      expect(country).toBeDefined()
      expect(country?.type).toBe("OTHER")
    })
  })
})
