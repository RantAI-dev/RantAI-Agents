import { describe, it, expect } from "vitest"
import { svgToPng } from "@/lib/rendering/server/svg-to-png"

describe("server svgToPng", () => {
  const redRect = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50"><rect width="100" height="50" fill="#FF0000"/></svg>`

  it("returns a non-empty PNG Buffer", async () => {
    const buf = await svgToPng(redRect, 200, 100)
    expect(Buffer.isBuffer(buf)).toBe(true)
    expect(buf.length).toBeGreaterThan(80)
  })

  it("starts with PNG magic bytes", async () => {
    const buf = await svgToPng(redRect, 200, 100)
    expect(buf[0]).toBe(0x89)
    expect(buf[1]).toBe(0x50)
    expect(buf[2]).toBe(0x4e)
    expect(buf[3]).toBe(0x47)
  })

  it("produces a PNG with the requested pixel dimensions", async () => {
    const buf = await svgToPng(redRect, 400, 200)
    const w = buf.readUInt32BE(16)
    const h = buf.readUInt32BE(20)
    expect(w).toBe(400)
    expect(h).toBe(200)
  })

  it("upscales small SVGs to target (no whitespace equivalent of the client bug)", async () => {
    const tinySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="#00FF00"/></svg>`
    const buf = await svgToPng(tinySvg, 400, 200)
    expect(buf.readUInt32BE(16)).toBe(400)
    expect(buf.readUInt32BE(20)).toBe(200)
  })
})
