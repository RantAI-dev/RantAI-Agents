/**
 * Rewrite an <svg>'s `width`, `height`, and `preserveAspectRatio` attributes.
 * Isomorphic — pure regex, no DOM.
 *
 * Used upstream of rasterizers so that the downstream (sharp, canvas) receives
 * an SVG that already declares its target dimensions; letterboxing is then
 * governed by the SVG's own viewBox + preserveAspectRatio rather than the
 * rasterizer's fit algorithm.
 */
export function resizeSvg(svg: string, width: number, height: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs
      .replace(/\s+width\s*=\s*"[^"]*"/g, "")
      .replace(/\s+height\s*=\s*"[^"]*"/g, "")
      .replace(/\s+preserveAspectRatio\s*=\s*"[^"]*"/g, "")
    return `<svg${cleaned} width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`
  })
}
