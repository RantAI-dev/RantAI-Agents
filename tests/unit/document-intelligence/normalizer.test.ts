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

    it("falls back to OTHER for unrecognized types", () => {
      expect(normalizeEntityType("UNKNOWN_TYPE")).toBe("OTHER")
      expect(normalizeEntityType("")).toBe("OTHER")
    })
  })

  describe("isTrivialEntity", () => {
    it("flags fragments with length < 3 as trivial", () => {
      expect(isTrivialEntity("ab", "OTHER")).toBe(true)
      expect(isTrivialEntity("a", "PERSON")).toBe(true)
      expect(isTrivialEntity("  x  ", "CONCEPT")).toBe(true)
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
    })

    it("preserves valid meaningful entities", () => {
      expect(isTrivialEntity("PT Sinar Nusantara Digital", "ORGANIZATION")).toBe(false)
      expect(isTrivialEntity("Direktur Utama", "ROLE")).toBe(false)
      expect(isTrivialEntity("Jakarta", "LOCATION")).toBe(false)
      expect(isTrivialEntity("2026", "DATE")).toBe(false)
      expect(isTrivialEntity("AI Platform", "CONCEPT")).toBe(false)
    })
  })

  describe("normalizeEntities", () => {
    it("normalizes entity types, drops trivial fragments, and deduplicates", () => {
      const rawEntities: ExtractedEntity[] = [
        { name: "PT Sinar Nusantara Digital", type: "ORG", confidence: 0.95 },
        { name: "Direktur Utama", type: "PERSON", confidence: 0.8 },
        { name: "Digital", type: "OTHER", confidence: 0.8 }, // trivial fragment -> drop
        { name: "dan", type: "OTHER", confidence: 0.9 }, // stopword -> drop
        { name: "ab", type: "CONCEPT", confidence: 0.9 }, // <3 chars -> drop
        { name: "pt sinar nusantara digital", type: "ORGANIZATION", confidence: 0.98 }, // duplicate with higher confidence
      ]

      const normalized = normalizeEntities(rawEntities)

      expect(normalized).toHaveLength(2)

      const org = normalized.find((e) => e.type === "ORGANIZATION")
      expect(org).toBeDefined()
      expect(org?.confidence).toBe(0.98)

      const role = normalized.find((e) => e.type === "ROLE")
      expect(role).toBeDefined()
      expect(role?.name).toBe("Direktur Utama")
    })
  })
})
