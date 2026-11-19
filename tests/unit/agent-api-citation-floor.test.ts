/**
 * Unit tests for the cited-source floor on the v1 chat API
 * (2026-11-18 brief, task C).
 *
 * The live failure this pins: an answer cited `[2]` and `sources` came back
 * empty, because source 2's best chunk scored just under the relevance
 * floor and the floor filtered it out before the citation match. A source
 * the answer actually cites is part of the answer's evidence — it is shown
 * even below the floor, with its `[n]` unchanged. The floor keeps its other
 * job: an UNCITED low scorer stays hidden in `sources:"all"`.
 *
 * Pure functions, no mocks: source-selection imports nothing at runtime.
 */
import { describe, it, expect } from "vitest"
import {
  citedSourceNumbers,
  scoreSources,
  selectResponseSources,
  type ScoredSource,
  type SourceSelection,
} from "@/features/agent-api/source-selection"

const CITED: SourceSelection = { mode: "cited", grounded: true, ungroundedKeep: false }
const ALL: SourceSelection = { mode: "all", grounded: true, ungroundedKeep: false }
const KEEP: SourceSelection = { mode: "cited", grounded: false, ungroundedKeep: true }

/** A source card the way scoreSources builds it. */
function source(n: number, passesFloor: boolean): ScoredSource {
  return {
    title: `Buku ${n}`,
    section: `Bab ${n}`,
    documentId: `doc-${n}`,
    assetKey: null,
    page: n,
    chunkType: null,
    chunkIndex: null,
    anchorChunkIndex: null,
    number: n,
    bestChunkScore: passesFloor ? 0.5 : 0.2,
    passesFloor,
  }
}

describe("citedSourceNumbers", () => {
  it("collects [n] and [figure:N] in first-appearance order", () => {
    expect(citedSourceNumbers("a [2] b [1] c [2] [figure:3]")).toEqual([2, 1, 3])
    expect(citedSourceNumbers("no citations here")).toEqual([])
    // An array index is not a citation.
    expect(citedSourceNumbers("x = arr[12]")).toEqual([12])
  })
})

describe("a cited source must not disappear (the live case)", () => {
  it("a cited below-floor source is returned with cited:true, number unchanged", () => {
    // The live shape: two sources, the answer cites only [2], and source 2
    // is under the floor.
    const sources = [source(1, true), source(2, false)]
    const out = selectResponseSources(sources, "Perbandingannya adalah [2].", CITED)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ number: 2, cited: true, documentId: "doc-2" })
    // The number stays the one the model saw — no renumbering.
    expect(out[0].number).toBe(2)
  })

  it("the same case through scoreSources' real floor: best chunk 0.30 under floor 0.34", () => {
    // Reproduce the incident's numbers: source 2's best chunk scored 0.30,
    // the threshold in use was 0.34.
    const chunks = [
      { assetKey: null, documentTitle: "Buku 1", section: "Bab 1" },
      { assetKey: null, documentTitle: "Buku 2", section: "Bab 2" },
    ]
    const scored = scoreSources(
      [
        { title: "Buku 1", section: "Bab 1", documentId: "doc-1" },
        { title: "Buku 2", section: "Bab 2", documentId: "doc-2" },
      ],
      chunks,
      (chunk) => (chunk.documentTitle === "Buku 1" ? 0.5 : 0.3),
      0.34,
    )
    expect(scored[1].passesFloor).toBe(false)
    const out = selectResponseSources(scored, "Jawab: [2].", CITED)
    expect(out.map((s) => s.number)).toEqual([2])
    expect(out[0].cited).toBe(true)
  })

  it("a cited above-floor source is still returned (regression guard)", () => {
    const sources = [source(1, true), source(2, false)]
    const out = selectResponseSources(sources, "Menurut [1].", CITED)
    expect(out.map((s) => s.number)).toEqual([1])
    expect(out[0].cited).toBe(true)
  })

  it("nothing cited → [] (the irrelevant-reference rule stands)", () => {
    const sources = [source(1, true), source(2, false)]
    expect(selectResponseSources(sources, "The books do not cover this.", CITED)).toEqual([])
  })
})

describe("sources:'all' keeps the floor for uncited low scorers", () => {
  it("returns above-floor sources plus cited below-floor ones; uncited below-floor stay hidden", () => {
    const sources = [source(1, true), source(2, false), source(3, false)]
    const out = selectResponseSources(sources, "Satu [3].", ALL)
    expect(out.map((s) => [s.number, s.cited])).toEqual([
      [1, false],
      [3, true],
    ])
  })

  it("an all-cited answer shows every source, floor or not", () => {
    const sources = [source(1, true), source(2, false)]
    const out = selectResponseSources(sources, "a [1] b [2]", ALL)
    expect(out.map((s) => [s.number, s.cited])).toEqual([
      [1, true],
      [2, true],
    ])
  })
})

describe("ungrounded keep mode still returns everything", () => {
  it("keep mode keeps every source with its cited flag", () => {
    // In production keep mode scores with floor 0, so passesFloor is true
    // everywhere; the selection must not drop anything on top of that.
    const sources = [source(1, true), source(2, true)]
    const out = selectResponseSources(sources, "x [2]", KEEP)
    expect(out.map((s) => s.number)).toEqual([1, 2])
    expect(out.find((s) => s.number === 2)?.cited).toBe(true)
    expect(out.find((s) => s.number === 1)?.cited).toBe(false)
  })
})

describe("empty inputs", () => {
  it("no sources at all answers []", () => {
    expect(selectResponseSources([], "anything [1]", CITED)).toEqual([])
    expect(selectResponseSources([], "", ALL)).toEqual([])
  })
})
