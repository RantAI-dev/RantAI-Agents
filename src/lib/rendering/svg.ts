/**
 * SVG -> PNG conversion for artifact export pipelines.
 *
 * Uses the browser Canvas API to rasterize an SVG string at 2x resolution
 * for crisp rendering in downstream containers (e.g. PPTX). Client-side
 * only — requires `document` and `Image`.
 */

/**
 * Convert an SVG string to a base64-encoded PNG data URL.
 *
 * @param svgString - The SVG markup as a string
 * @param width     - Target width in pixels (rendered at 2x internally)
 * @param height    - Target height in pixels (rendered at 2x internally)
 * @returns `data:image/png;base64,...`
 */
export async function renderSvgToPng(
  svgString: string,
  width: number,
  height: number,
): Promise<string> {
  const scale = 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      reject(new Error("Could not get canvas 2D context"))
      return
    }

    // Use base64 data URL (not blob URL) to avoid CORS tainting the canvas.
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

    img.onload = () => {
      canvas.width = width * scale
      canvas.height = height * scale

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)

      const svgWidth = img.naturalWidth || width
      const svgHeight = img.naturalHeight || height
      const scaleX = width / svgWidth
      const scaleY = height / svgHeight
      const fitScale = Math.min(scaleX, scaleY, 1)

      const drawWidth = svgWidth * fitScale
      const drawHeight = svgHeight * fitScale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
      resolve(canvas.toDataURL("image/png"))
    }

    img.onerror = () => {
      reject(new Error("Failed to load SVG image"))
    }

    img.src = dataUrl
  })
}
