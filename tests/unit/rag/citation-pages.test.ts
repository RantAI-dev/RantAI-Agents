import { describe, it, expect } from "vitest"
import type { SearchResult } from "@/lib/rag/vector-store"

describe("Chunk-level page numbers for citations (TC-984)", () => {
  it("accumulates distinct chunk-level pages for chunks of the same document", () => {
    // Simulate chunks retrieved from an 80-page document
    const chunks: SearchResult[] = [
      {
        id: "chunk_p39",
        documentId: "doc_80pages",
        documentTitle: "FILE006 Uji Ingestion 80 Hal",
        section: "Bagian P20",
        categories: [],
        subcategory: null,
        similarity: 0.85,
        contextualPrefix: null,
        content: "Spesifikasi ING-P20-6120",
        page: 38, // 0-indexed page 38 -> page 39
      },
      {
        id: "chunk_p79",
        documentId: "doc_80pages",
        documentTitle: "FILE006 Uji Ingestion 80 Hal",
        section: "Bagian P20", // Same title + section dedupe key
        categories: [],
        subcategory: null,
        similarity: 0.80,
        contextualPrefix: null,
        content: "Spesifikasi ING-P40-6140",
        page: 78, // 0-indexed page 78 -> page 79
      },
      {
        id: "chunk_p39_bis",
        documentId: "doc_80pages",
        documentTitle: "FILE006 Uji Ingestion 80 Hal",
        section: "Bagian P20",
        categories: [],
        subcategory: null,
        similarity: 0.75,
        contextualPrefix: null,
        content: "Tambahan penjelasan",
        page: 38, // duplicate page
      },
    ]

    // Reproduce retriever.ts sourceMap deduplication logic
    const sourceMap = new Map<
      string,
      {
        documentId: string | null
        documentTitle: string
        section: string | null
        page?: number | null
        pages?: number[]
      }
    >()

    const sourceDedupeKey = (c: SearchResult) => `${c.documentTitle}-${c.section || ""}`

    for (const chunk of chunks) {
      const key = sourceDedupeKey(chunk)
      const existing = sourceMap.get(key)
      if (!existing) {
        sourceMap.set(key, {
          documentId: chunk.documentId ?? null,
          documentTitle: chunk.documentTitle,
          section: chunk.section,
          page: chunk.page ?? null,
          pages: chunk.page != null ? [chunk.page] : [],
        })
      } else {
        if (chunk.page != null) {
          if (!existing.pages) existing.pages = existing.page != null ? [existing.page] : []
          if (!existing.pages.includes(chunk.page)) {
            existing.pages.push(chunk.page)
            existing.pages.sort((a, b) => a - b)
          }
          if (existing.page == null) existing.page = chunk.page
        }
      }
    }

    const sources = Array.from(sourceMap.values())
    expect(sources).toHaveLength(1)
    expect(sources[0].pages).toEqual([38, 78])
    // Both distinct pages (39 and 79) are preserved, not collapsed to just page 1!
  })
})
