/**
 * Server-side SVG → PNG rasterizer using sharp.
 *
 * Uses fit:'contain' + white background so aspect-mismatched SVGs are
 * letterboxed rather than distorted or clipped. Pairs with `resize-svg`
 * upstream when the SVG's intrinsic dimensions differ from the target.
 */

import sharp from "sharp"

export async function svgToPng(
  svg: string,
  width: number,
  height: number,
): Promise<Buffer> {
  return sharp(Buffer.from(svg))
    .resize(width, height, {
      fit: "contain",
      background: "#FFFFFF",
      kernel: sharp.kernel.lanczos3,
    })
    .flatten({ background: "#FFFFFF" })
    .png({ compressionLevel: 6 })
    .toBuffer()
}
