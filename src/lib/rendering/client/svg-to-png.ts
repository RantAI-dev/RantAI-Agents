/**
 * Client-side SVG to PNG conversion utility.
 *
 * Uses Canvas API to convert SVG strings to base64 PNG at 2x resolution.
 * Browser-only — imports into server code paths will fail at runtime.
 */

/**
 * Convert an SVG string to a base64-encoded PNG data URL.
 *
 * @param svgString - The SVG markup as a string
 * @param width - Target width in pixels (rendered at 2x internal resolution)
 * @param height - Target height in pixels (rendered at 2x internal resolution)
 * @returns Base64 PNG data URL (data:image/png;base64,...)
 */
export async function svgToBase64Png(
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

    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

    img.onload = () => {
      canvas.width = width * scale
      canvas.height = height * scale

      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.scale(scale, scale)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = "high"

      const svgWidth = img.naturalWidth || width
      const svgHeight = img.naturalHeight || height
      const scaleX = width / svgWidth
      const scaleY = height / svgHeight
      const fitScale = Math.min(scaleX, scaleY)

      const drawWidth = svgWidth * fitScale
      const drawHeight = svgHeight * fitScale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)
      resolve(canvas.toDataURL("image/png"))
    }

    img.onerror = () => reject(new Error("Failed to load SVG image"))
    img.src = dataUrl
  })
}

/**
 * Fetch an image URL and convert to a base64 data URL.
 *
 * Slide content arriving here normally has already had its `unsplash:`
 * URLs resolved server-side by the validator dispatcher (the slides
 * JSON walker runs `resolveSlideImages` before persist). If a raw
 * `unsplash:` prefix slips through anyway — for instance when the
 * server-side resolver failed and stored the original URL — we fall
 * back to a placehold.co URL with the keyword embedded as visible
 * text. Earlier code hit `https://source.unsplash.com/...`, which
 * Unsplash retired; that path silently returned null and produced
 * empty placeholders in the exported PPTX.
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    let imageUrl = url
    if (url.startsWith("unsplash:")) {
      const keyword = url.slice(9).trim()
      imageUrl = `https://placehold.co/1200x800/f1f5f9/64748b?text=${encodeURIComponent(keyword)}`
    }

    const response = await fetch(imageUrl)
    if (!response.ok) return null

    const blob = await response.blob()
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = () => resolve(null)
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}
