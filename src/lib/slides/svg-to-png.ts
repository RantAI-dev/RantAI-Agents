/**
 * SVG to PNG conversion utility for PPTX export
 *
 * Uses Canvas API to convert SVG strings to base64 PNG at 2x resolution
 * for crisp rendering in PowerPoint. Client-side only.
 */

/**
 * Convert an SVG string to a base64-encoded PNG data URL
 *
 * @param svgString - The SVG markup as a string
 * @param width - Target width in pixels (will be rendered at 2x)
 * @param height - Target height in pixels (will be rendered at 2x)
 * @returns Base64 PNG data URL (data:image/png;base64,...)
 */
export async function svgToBase64Png(
  svgString: string,
  width: number,
  height: number
): Promise<string> {
  // Scale factor for crisp @2x rendering
  const scale = 2

  return new Promise((resolve, reject) => {
    const img = new Image()
    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")

    if (!ctx) {
      reject(new Error("Could not get canvas 2D context"))
      return
    }

    // Use base64 data URL instead of blob URL to avoid CORS tainting
    const svgBase64 = btoa(unescape(encodeURIComponent(svgString)))
    const dataUrl = `data:image/svg+xml;base64,${svgBase64}`

    img.onload = () => {
      // Set canvas size at 2x resolution
      canvas.width = width * scale
      canvas.height = height * scale

      // Fill with white background
      ctx.fillStyle = "#FFFFFF"
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Scale the context for @2x rendering
      ctx.scale(scale, scale)

      // Calculate scaling to fit SVG within bounds
      const svgWidth = img.naturalWidth || width
      const svgHeight = img.naturalHeight || height
      const scaleX = width / svgWidth
      const scaleY = height / svgHeight
      const fitScale = Math.min(scaleX, scaleY, 1)

      // Center the image
      const drawWidth = svgWidth * fitScale
      const drawHeight = svgHeight * fitScale
      const offsetX = (width - drawWidth) / 2
      const offsetY = (height - drawHeight) / 2

      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

      // Return as PNG data URL
      resolve(canvas.toDataURL("image/png"))
    }

    img.onerror = () => {
      reject(new Error("Failed to load SVG image"))
    }

    img.src = dataUrl
  })
}

/**
 * Fetch an image URL and convert to base64 data URL
 * Handles both regular URLs and unsplash:keyword syntax
 *
 * @param url - Image URL or "unsplash:keyword"
 * @returns Base64 data URL or null if fetch fails
 */
export async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    let imageUrl = url

    // Handle unsplash:keyword syntax
    if (url.startsWith("unsplash:")) {
      const keyword = url.slice(9).trim()
      // Use Unsplash Source API for direct image URL
      // This redirects to a random image matching the keyword
      imageUrl = `https://source.unsplash.com/1600x900/?${encodeURIComponent(keyword)}`
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

/**
 * Render Mermaid diagram code to base64 PNG
 * Requires Mermaid library to be available in the browser
 *
 * @param diagramCode - Mermaid diagram code
 * @param width - Target width
 * @param height - Target height
 * @returns Base64 PNG data URL or null if rendering fails
 */
export async function mermaidToBase64Png(
  diagramCode: string,
  width = 1200,
  height = 800
): Promise<string | null> {
  try {
    // Dynamic import of mermaid
    const mermaid = await import("mermaid").then((m) => m.default)

    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: {
        background: "#ffffff",
        primaryColor: "#ffffff",
        primaryTextColor: "#1c1c1c",
        primaryBorderColor: "#e2e1de",
        lineColor: "#6b6b6b",
        textColor: "#1c1c1c",
        fontFamily: "system-ui, -apple-system, sans-serif",
        fontSize: "14px",
      },
    })

    const id = `pptx-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const { svg } = await mermaid.render(id, diagramCode.trim())

    return svgToBase64Png(svg, width, height)
  } catch (error) {
    console.error("[mermaid-to-png] Failed:", error)
    return null
  }
}
