import { describe, it, expect } from "vitest"
import { resizeSvg } from "@/lib/rendering/resize-svg"

describe("resizeSvg", () => {
  it("rewrites existing width and height attributes", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect/></svg>`
    const out = resizeSvg(input, 1200, 800)
    expect(out).toContain(`width="1200"`)
    expect(out).toContain(`height="800"`)
    expect(out).not.toContain(`width="300"`)
    expect(out).not.toContain(`height="150"`)
  })

  it("adds width and height when missing", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect/></svg>`
    const out = resizeSvg(input, 400, 200)
    expect(out).toContain(`width="400"`)
    expect(out).toContain(`height="200"`)
    expect(out).toContain(`viewBox="0 0 100 50"`) // preserved
  })

  it("overrides preserveAspectRatio to xMidYMid meet", () => {
    const input = `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="10" height="10"/>`
    const out = resizeSvg(input, 100, 100)
    expect(out).toContain(`preserveAspectRatio="xMidYMid meet"`)
    expect(out).not.toContain(`preserveAspectRatio="none"`)
  })

  it("leaves content untouched", () => {
    const input = `<svg width="1" height="1"><circle cx="5" cy="5" r="3" fill="red"/></svg>`
    const out = resizeSvg(input, 10, 10)
    expect(out).toContain(`<circle cx="5" cy="5" r="3" fill="red"/>`)
  })

  it("handles multi-line svg opening tags", () => {
    const input = `<svg
  xmlns="http://www.w3.org/2000/svg"
  width="50"
  height="50"
><rect/></svg>`
    const out = resizeSvg(input, 200, 200)
    expect(out).toContain(`width="200"`)
    expect(out).toContain(`height="200"`)
  })
})
