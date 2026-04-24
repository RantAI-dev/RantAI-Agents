// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { svgToBase64Png } from "@/lib/rendering/client/svg-to-png"

describe("svgToBase64Png — upscale allowed (sizing bug regression)", () => {
  let drawImageArgs: number[][] = []
  let originalImage: typeof Image

  beforeEach(() => {
    drawImageArgs = []

    // Stub HTMLCanvasElement getContext to capture drawImage arguments
    const realGetContext = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string) {
      if (type !== "2d") return realGetContext.call(this, type as "2d")
      return {
        fillStyle: "",
        fillRect: () => {},
        scale: () => {},
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "low",
        drawImage: (_img: unknown, x: number, y: number, w: number, h: number) => {
          drawImageArgs.push([x, y, w, h])
        },
      } as unknown as CanvasRenderingContext2D
    }

    // Stub canvas.toDataURL so the promise resolves
    HTMLCanvasElement.prototype.toDataURL = () => "data:image/png;base64,stub"

    // Stub Image to fire onload synchronously with a small natural size (mimicks mermaid SVG)
    originalImage = globalThis.Image
    class StubImage {
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      naturalWidth = 300
      naturalHeight = 150
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }
    ;(globalThis as unknown as { Image: unknown }).Image = StubImage
  })

  afterEach(() => {
    ;(globalThis as unknown as { Image: unknown }).Image = originalImage
    vi.restoreAllMocks()
  })

  it("upscales a small SVG to fill a large target canvas", async () => {
    await svgToBase64Png(
      `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="150"><rect/></svg>`,
      1200,
      800,
    )

    expect(drawImageArgs).toHaveLength(1)
    const [x, y, w, h] = drawImageArgs[0]

    // Pre-fix: fitScale clamped at 1 → drawn at native 300x150 centered (large offset)
    // Post-fix: fitScale = min(1200/300, 800/150) = min(4, 5.33) = 4 → 1200x600 centered
    expect(w).toBeGreaterThan(300)
    expect(h).toBeGreaterThan(150)
    expect(w).toBe(1200) // fills width
    expect(h).toBe(600) // aspect-preserved (300:150 = 2:1, 1200:600 = 2:1)
    expect(x).toBe(0)
    expect(y).toBe(100) // (800 - 600) / 2
  })

  it("does not shrink an SVG that already fits", async () => {
    ;(globalThis as { Image: unknown }).Image = class {
      onload: (() => void) | null = null
      naturalWidth = 1200
      naturalHeight = 800
      set src(_v: string) {
        queueMicrotask(() => this.onload?.())
      }
    }

    await svgToBase64Png(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect/></svg>`,
      1200,
      800,
    )

    expect(drawImageArgs).toHaveLength(1)
    const [, , w, h] = drawImageArgs[0]
    expect(w).toBe(1200)
    expect(h).toBe(800)
  })
})
