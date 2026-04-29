import { describe, it, expect } from "vitest"
import { colorClassToClassName } from "@/lib/spreadsheet/styles"

describe("colorClassToClassName", () => {
  it("input → blue text", () => {
    expect(colorClassToClassName("input")).toContain("text-")
    expect(colorClassToClassName("input")).toMatch(/blue|0000ff/i)
  })

  it("formula → black/default text (no color override)", () => {
    expect(colorClassToClassName("formula")).toBe("")
  })

  it("cross-sheet → green text", () => {
    expect(colorClassToClassName("cross-sheet")).toMatch(/green|008000/i)
  })

  it("external → red text", () => {
    expect(colorClassToClassName("external")).toMatch(/red|ff0000/i)
  })

  it("header → bold + slightly larger", () => {
    const c = colorClassToClassName("header")
    expect(c).toMatch(/font-bold|font-semibold/)
  })

  it("default → empty", () => {
    expect(colorClassToClassName("default")).toBe("")
  })
})
