/**
 * Unit tests for the IKAT-Bench placement metric suite.
 *
 * These guard the numbers that go into the paper. A silent regression here would
 * not crash anything — it would just publish a wrong table, which is worse.
 */
import { describe, it, expect } from "vitest"
import {
  splitSentences,
  idealSlot,
  displacement,
  meanAbsDisplacement,
  placementAccuracy,
  figureSelection,
  groundedFigureF1,
  macroAverage,
  pearson,
  type PlacedFigure,
} from "../bench-kb/src/placement-metrics"

describe("splitSentences", () => {
  it("splits on sentence enders", () => {
    expect(splitSentences("Ini kalimat satu. Ini kalimat dua!")).toEqual([
      "Ini kalimat satu.",
      "Ini kalimat dua!",
    ])
  })

  it("does not split on Indonesian abbreviations, and restores the dot", () => {
    const out = splitSentences("Lihat hal. 12 untuk penjelasan. Selesai.")
    expect(out).toEqual(["Lihat hal. 12 untuk penjelasan.", "Selesai."])
  })

  it("does not split on figure numbering, and preserves the decimal", () => {
    const out = splitSentences("Perhatikan Gambar 2.1 di bawah. Lalu jawab.")
    expect(out).toEqual(["Perhatikan Gambar 2.1 di bawah.", "Lalu jawab."])
  })

  it("treats markdown list items and headings as their own units", () => {
    const out = splitSentences("## Judul\n- item satu\n- item dua")
    expect(out).toEqual(["## Judul", "- item satu", "- item dua"])
  })

  it("returns empty for blank input", () => {
    expect(splitSentences("   ")).toEqual([])
  })

  it("keeps a trailing citation marker on its own sentence", () => {
    // Generators write "…gulung. [1]" — a naive split makes "[1]" a sentence,
    // which shifts every slot after it and feeds an empty token to the
    // similarity that decides ideal().
    expect(splitSentences("Alat ukurnya penggaris. [1] Lalu meteran. [2]")).toEqual([
      "Alat ukurnya penggaris. [1]",
      "Lalu meteran. [2]",
    ])
  })

  it("merges a multi-citation fragment too", () => {
    expect(splitSentences("Jawabannya begitu. [1][2]")).toEqual(["Jawabannya begitu. [1][2]"])
  })
})

describe("idealSlot", () => {
  it("returns the slot AFTER the best-matching sentence", () => {
    // best match is index 1 (second sentence) -> figure follows it -> slot 2
    expect(idealSlot([0.1, 0.9, 0.3])).toBe(2)
  })

  it("returns -1 when there is nothing to match", () => {
    expect(idealSlot([])).toBe(-1)
  })
})

const fig = (id: string, predicted: number, ideal: number): PlacedFigure => ({
  figureId: id,
  predictedSlot: predicted,
  idealSlot: ideal,
})

describe("displacement", () => {
  it("is positive when placed later than ideal", () => {
    expect(displacement(fig("f1", 5, 3))).toBe(2)
  })

  it("averages absolute values and ignores unscoreable entries", () => {
    // |2| and |1| -> 1.5 ; the -1 ideal is skipped, not counted as a hit
    expect(meanAbsDisplacement([fig("a", 5, 3), fig("b", 2, 3), fig("c", 4, -1)])).toBe(1.5)
  })

  it("returns null when nothing is scoreable", () => {
    expect(meanAbsDisplacement([fig("a", 1, -1)])).toBeNull()
  })
})

describe("placementAccuracy", () => {
  it("counts placements within tolerance k", () => {
    const figs = [fig("a", 3, 3), fig("b", 4, 3), fig("c", 7, 3)]
    expect(placementAccuracy(figs, 0)).toBeCloseTo(1 / 3)
    expect(placementAccuracy(figs, 1)).toBeCloseTo(2 / 3)
  })
})

describe("figureSelection", () => {
  it("computes precision, recall and f1", () => {
    const r = figureSelection(["a", "b", "x"], ["a", "b", "c"])!
    expect(r.precision).toBeCloseTo(2 / 3)
    expect(r.recall).toBeCloseTo(2 / 3)
    expect(r.f1).toBeCloseTo(2 / 3)
  })

  it("does not divide by zero on empty prediction", () => {
    const r = figureSelection([], ["a"])!
    expect(r.precision).toBe(0)
    expect(r.recall).toBe(0)
    expect(r.f1).toBe(0)
  })

  it("is NULL when nothing was expected and nothing emitted (vacuous)", () => {
    // Scoring this as 0 would drag every macro-average down in proportion to how
    // many text-only questions the set contains — measuring the question mix,
    // not the system.
    expect(figureSelection([], [])).toBeNull()
  })

  it("still penalises emitting a figure where none belongs", () => {
    const r = figureSelection(["x"], [])!
    expect(r.precision).toBe(0)
  })
})

describe("groundedFigureF1", () => {
  it("penalises a correctly-selected but badly-placed figure", () => {
    // Both figures are the RIGHT figures, but 'b' lands 4 sentences off.
    const predicted = [fig("a", 3, 3), fig("b", 7, 3)]
    const r = groundedFigureF1(predicted, ["a", "b"], 1)

    // Selection alone looks perfect...
    expect(r.selection!.f1).toBeCloseTo(1)
    // ...but the grounded metric only credits the well-placed one.
    expect(r.grounded!.precision).toBeCloseTo(0.5)
    expect(r.grounded!.recall).toBeCloseTo(0.5)
    expect(r.placementAccuracy).toBeCloseTo(0.5)
  })

  it("is null for a question with no figures where none were emitted", () => {
    expect(groundedFigureF1([], [], 1).grounded).toBeNull()
  })

  it("gives full credit when selection and placement are both right", () => {
    const r = groundedFigureF1([fig("a", 3, 3), fig("b", 5, 4)], ["a", "b"], 1)
    expect(r.grounded!.f1).toBeCloseTo(1)
  })

  it("penalises a well-placed but WRONG figure", () => {
    // 'x' is not in gold: precision drops even though its displacement is 0.
    const r = groundedFigureF1([fig("a", 3, 3), fig("x", 2, 2)], ["a"], 1)
    expect(r.grounded!.precision).toBeCloseTo(0.5)
    expect(r.grounded!.recall).toBeCloseTo(1)
  })
})

describe("macroAverage", () => {
  it("skips nulls rather than treating them as zero", () => {
    expect(macroAverage([1, null, 0])).toBeCloseTo(0.5)
  })

  it("returns null when there is no evidence at all", () => {
    expect(macroAverage([null, null])).toBeNull()
  })
})

describe("pearson", () => {
  it("is 1 for a perfect positive relationship", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
  })

  it("is -1 for a perfect inverse relationship", () => {
    expect(pearson([1, 2, 3], [6, 4, 2])).toBeCloseTo(-1)
  })

  it("returns null on a constant series (undefined correlation)", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })
})
