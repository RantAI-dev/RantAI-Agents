import { describe, it, expect } from "vitest"
import {
  reciprocalRankFusion,
  guaranteeIdentifierSlots,
  type RrfItem,
} from "@/lib/rag/hybrid-merge"

describe("reciprocalRankFusion", () => {
  it("merges two ranked lists by RRF score, highest score first", () => {
    const listA = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const listB = [{ id: "b" }, { id: "a" }, { id: "d" }]
    const result = reciprocalRankFusion([listA, listB])
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c", "d"])
  })

  it("handles single list (no fusion, preserves order)", () => {
    const list = [{ id: "a" }, { id: "b" }, { id: "c" }]
    const result = reciprocalRankFusion([list])
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"])
  })

  it("empty lists produce empty result", () => {
    expect(reciprocalRankFusion([])).toEqual([])
    expect(reciprocalRankFusion([[], []])).toEqual([])
  })

  it("caps to limit param when provided", () => {
    const listA = Array.from({ length: 10 }, (_, i) => ({ id: `a${i}` }))
    const result = reciprocalRankFusion([listA], { limit: 3 })
    expect(result.length).toBe(3)
  })

  it("k constant affects rank weighting", () => {
    const listA = [{ id: "x" }, { id: "y" }]
    const listB = [{ id: "y" }, { id: "x" }]
    const tight = reciprocalRankFusion([listA, listB], { k: 1 })
    const loose = reciprocalRankFusion([listA, listB], { k: 1000 })
    expect(tight.map((r) => r.id).sort()).toEqual(["x", "y"])
    expect(loose.map((r) => r.id).sort()).toEqual(["x", "y"])
  })
})

describe("guaranteeIdentifierSlots & fusion slot guarantee (TC-994)", () => {
  interface TestItem extends RrfItem {
    id: string
    content?: string
    matchedIdentifiers?: string[]
  }

  it("guarantees at least one slot per exact identifier match before filling remaining slots", () => {
    // 6 items: item1..item5 match code ING-P20-6120 or are general.
    // item6 matches ING-P40-6140 but is ranked 6th.
    const items: TestItem[] = [
      { id: "item1", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "item2", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "item3", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "item4" },
      { id: "item5" },
      { id: "item6", matchedIdentifiers: ["ING-P40-6140"] },
    ]

    // Without guarantee, limit 3 would only take item1, item2, item3.
    // With guarantee for both codes, both ING-P20-6120 (item1) and ING-P40-6140 (item6)
    // are guaranteed slots, and the 3rd slot is filled by item2.
    const guaranteed = guaranteeIdentifierSlots(
      items,
      ["ING-P20-6120", "ING-P40-6140"],
      3
    )

    const ids = guaranteed.map((i) => i.id)
    expect(ids).toHaveLength(3)
    expect(ids).toContain("item1")
    expect(ids).toContain("item6") // ING-P40-6140 is preserved despite being ranked 6th!
    expect(ids).toContain("item2")
  })

  it("reciprocalRankFusion honors guaranteedIdentifiers option", () => {
    const listA: TestItem[] = [
      { id: "chunk_p20_a", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "chunk_p20_b", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "chunk_p20_c", matchedIdentifiers: ["ING-P20-6120"] },
    ]
    const listB: TestItem[] = [
      { id: "chunk_general_1" },
      { id: "chunk_general_2" },
      { id: "chunk_p40_solo", matchedIdentifiers: ["ING-P40-6140"] },
    ]

    const fused = reciprocalRankFusion<TestItem>([listA, listB], {
      limit: 3,
      guaranteedIdentifiers: ["ING-P20-6120", "ING-P40-6140"],
    })

    const fusedIds = fused.map((r) => r.id)
    expect(fusedIds).toHaveLength(3)
    expect(fusedIds).toContain("chunk_p20_a")
    expect(fusedIds).toContain("chunk_p40_solo")
  })

  it("matches identifiers from item content when matchedIdentifiers is not pre-populated", () => {
    const items: TestItem[] = [
      { id: "c1", content: "Informasi mengenai kode ING-P20-6120 revisi 1." },
      { id: "c2", content: "Informasi mengenai kode ING-P20-6120 revisi 2." },
      { id: "c3", content: "Dokumen umum tanpa kode spesifik." },
      { id: "c4", content: "Spesifikasi lengkap dari modul ING-P40-6140 pada halaman 79." },
    ]

    const result = guaranteeIdentifierSlots(
      items,
      ["ING-P20-6120", "ING-P40-6140"],
      2
    )

    expect(result.map((r) => r.id)).toEqual(["c1", "c4"])
  })

  it("handles non-existent identifiers gracefully (positive control)", () => {
    const items: TestItem[] = [
      { id: "a", matchedIdentifiers: ["ING-P20-6120"] },
      { id: "b" },
      { id: "c" },
    ]

    const result = guaranteeIdentifierSlots(
      items,
      ["ING-P20-6120", "UNKNOWN-CODE-999"],
      2
    )

    // UNKNOWN-CODE-999 has no match in pool; slot is filled with next available item
    expect(result.map((r) => r.id)).toEqual(["a", "b"])
  })

  it("handles a single chunk satisfying multiple guaranteed identifiers", () => {
    const items: TestItem[] = [
      { id: "multi", matchedIdentifiers: ["ING-P20-6120", "ING-P40-6140"] },
      { id: "other1" },
      { id: "other2" },
    ]

    const result = guaranteeIdentifierSlots(
      items,
      ["ING-P20-6120", "ING-P40-6140"],
      2
    )

    // 'multi' satisfies both, leaving remaining slot for 'other1'
    expect(result.map((r) => r.id)).toEqual(["multi", "other1"])
  })

  it("handles limit smaller than number of guaranteed matches gracefully", () => {
    const items: TestItem[] = [
      { id: "m1", matchedIdentifiers: ["CODE-A"] },
      { id: "m2", matchedIdentifiers: ["CODE-B"] },
      { id: "m3", matchedIdentifiers: ["CODE-C"] },
    ]

    const result = guaranteeIdentifierSlots(
      items,
      ["CODE-A", "CODE-B", "CODE-C"],
      2
    )

    expect(result).toHaveLength(2)
    expect(result.map((r) => r.id)).toEqual(["m1", "m2"])
  })
})
