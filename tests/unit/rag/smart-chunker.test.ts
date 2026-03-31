import { describe, it, expect } from "vitest"
import { SmartChunker, smartChunkDocument } from "@/lib/rag/smart-chunker"

// ─── SmartChunker.chunk ──────────────────────────────────────────────────────

describe("SmartChunker", () => {
  describe("basic chunking", () => {
    it("returns empty array for empty input", async () => {
      const chunker = new SmartChunker()
      const result = await chunker.chunk("")
      expect(result).toEqual([])
    })

    it("returns empty array for whitespace-only input", async () => {
      const chunker = new SmartChunker()
      const result = await chunker.chunk("   \n\n   ")
      expect(result).toEqual([])
    })

    it("returns single chunk for short text", async () => {
      const chunker = new SmartChunker({ maxChunkSize: 500 })
      const result = await chunker.chunk("Hello world.")
      expect(result).toHaveLength(1)
      expect(result[0].text).toBe("Hello world.")
      expect(result[0].chunkIndex).toBe(0)
    })

    it("splits long text into multiple chunks", async () => {
      const chunker = new SmartChunker({ maxChunkSize: 100, overlapSize: 0 })
      const text = Array(10).fill("This is a paragraph of moderate length for testing.").join("\n\n")
      const result = await chunker.chunk(text)
      expect(result.length).toBeGreaterThan(1)
    })

    it("assigns sequential chunkIndex", async () => {
      const chunker = new SmartChunker({ maxChunkSize: 50, overlapSize: 0 })
      const text = "First paragraph.\n\nSecond paragraph.\n\nThird paragraph."
      const result = await chunker.chunk(text)
      for (let i = 0; i < result.length; i++) {
        expect(result[i].chunkIndex).toBe(i)
      }
    })
  })

  describe("heading detection", () => {
    it("includes heading text in chunk output", async () => {
      const chunker = new SmartChunker()
      const text = "# Title\n\nSome body text."
      const result = await chunker.chunk(text)
      const allText = result.map((c) => c.text).join("\n")
      expect(allText).toContain("# Title")
      expect(allText).toContain("Some body text")
    })

    it("tracks hierarchy path from headings", async () => {
      const chunker = new SmartChunker()
      const text = "## Section\n\nContent here."
      const result = await chunker.chunk(text)
      const hasHierarchy = result.some(
        (c) => c.metadata.hierarchyPath && c.metadata.hierarchyPath.length > 0
      )
      expect(hasHierarchy).toBe(true)
    })

    it("builds hierarchy path from nested headings", async () => {
      const chunker = new SmartChunker()
      const text = "# Chapter 1\n\n## Section A\n\nContent under section A."
      const result = await chunker.chunk(text)
      const lastChunk = result[result.length - 1]
      expect(lastChunk.metadata.hierarchyPath).toBeDefined()
      expect(lastChunk.metadata.hierarchyPath!.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe("respects heading boundaries", () => {
    it("flushes chunk when new heading is encountered", async () => {
      const chunker = new SmartChunker({
        maxChunkSize: 10000,
        respectHeadingBoundaries: true,
      })
      const text = "# Heading 1\n\nParagraph one.\n\n# Heading 2\n\nParagraph two."
      const result = await chunker.chunk(text)
      expect(result.length).toBeGreaterThanOrEqual(2)
    })

    it("produces fewer chunks when heading boundaries disabled", async () => {
      const textWithHeadings = "# Heading 1\n\nParagraph one.\n\n# Heading 2\n\nParagraph two."

      const withBoundaries = new SmartChunker({
        maxChunkSize: 10000,
        respectHeadingBoundaries: true,
      })
      const withoutBoundaries = new SmartChunker({
        maxChunkSize: 10000,
        respectHeadingBoundaries: false,
      })

      const resultWith = await withBoundaries.chunk(textWithHeadings)
      const resultWithout = await withoutBoundaries.chunk(textWithHeadings)
      expect(resultWithout.length).toBeLessThanOrEqual(resultWith.length)
    })
  })

  describe("code block preservation", () => {
    it("keeps code blocks intact", async () => {
      const chunker = new SmartChunker({ preserveCodeBlocks: true })
      const code = "```javascript\nconst x = 1;\nconst y = 2;\n```"
      const text = `Some intro.\n\n${code}\n\nSome outro.`
      const result = await chunker.chunk(text)
      const codeChunk = result.find((c) => c.text.includes("const x = 1"))
      expect(codeChunk).toBeDefined()
      expect(codeChunk!.text).toContain("```")
    })

    it("detects code chunk type", async () => {
      const chunker = new SmartChunker()
      const text = "```python\nprint('hi')\n```"
      const result = await chunker.chunk(text)
      expect(result[0].metadata.chunkType).toBe("code")
    })
  })

  describe("table detection", () => {
    it("detects table chunk type", async () => {
      const chunker = new SmartChunker()
      const text = "| Col A | Col B |\n| --- | --- |\n| 1 | 2 |"
      const result = await chunker.chunk(text)
      const tableChunk = result.find((c) => c.metadata.chunkType === "table")
      expect(tableChunk).toBeDefined()
    })
  })

  describe("list detection", () => {
    it("detects list chunk type", async () => {
      const chunker = new SmartChunker()
      const text = "- Item one\n- Item two\n- Item three"
      const result = await chunker.chunk(text)
      expect(result[0].metadata.chunkType).toBe("list")
    })
  })

  describe("chunk size limits", () => {
    it("produces multiple chunks when content exceeds maxChunkSize", async () => {
      const chunker = new SmartChunker({ maxChunkSize: 200, overlapSize: 0 })
      const paragraphs = Array(20).fill("Short sentence here.").join("\n\n")
      const result = await chunker.chunk(paragraphs)
      expect(result.length).toBeGreaterThan(1)
    })
  })

  describe("sentence-based fallback", () => {
    it("falls back to sentence splitting for wall-of-text content", async () => {
      const chunker = new SmartChunker({ maxChunkSize: 200, overlapSize: 0 })
      // Single giant block with no paragraph breaks
      const text = Array(50).fill("This is a sentence. Another sentence here.").join(" ")
      const result = await chunker.chunk(text)
      expect(result.length).toBeGreaterThan(1)
    })
  })
})

// ─── smartChunkDocument ──────────────────────────────────────────────────────

describe("smartChunkDocument", () => {
  it("returns standard Chunk interface with metadata", async () => {
    const result = await smartChunkDocument(
      "# Title\n\nSome content here.",
      "Test Doc",
      "general"
    )
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]).toHaveProperty("content")
    expect(result[0]).toHaveProperty("metadata")
    expect(result[0].metadata.documentTitle).toBe("Test Doc")
    expect(result[0].metadata.category).toBe("general")
  })

  it("filters out empty chunks", async () => {
    const result = await smartChunkDocument("Some content.", "Doc", "cat")
    for (const chunk of result) {
      expect(chunk.content.length).toBeGreaterThan(0)
    }
  })

  it("passes subcategory through to metadata", async () => {
    const result = await smartChunkDocument("Content.", "Doc", "cat", "subcat")
    expect(result[0].metadata.subcategory).toBe("subcat")
  })
})
