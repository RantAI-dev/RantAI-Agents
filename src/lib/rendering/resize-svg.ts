/**
 * Rewrite an <svg>'s `width`, `height`, and `preserveAspectRatio` attributes.
 * Isomorphic — pure regex, no DOM.
 *
 * Used upstream of rasterizers so that the downstream (sharp, canvas) receives
 * an SVG that already declares its target dimensions; letterboxing is then
 * governed by the SVG's own viewBox + preserveAspectRatio rather than the
 * rasterizer's fit algorithm.
 */
// D-85: Mermaid output uses single-quoted attributes; the prior regex only
// stripped double-quoted forms, leaving `width='100'` in place alongside the
// new double-quoted attribute we appended → duplicate attrs in the output
// SVG. Each pattern now matches both quote styles.
const ATTR_DOUBLE = /\s+(width|height|preserveAspectRatio)\s*=\s*"[^"]*"/g
const ATTR_SINGLE = /\s+(width|height|preserveAspectRatio)\s*=\s*'[^']*'/g

export function resizeSvg(svg: string, width: number, height: number): string {
  return svg.replace(/<svg\b([^>]*)>/, (_match, attrs: string) => {
    const cleaned = attrs.replace(ATTR_DOUBLE, "").replace(ATTR_SINGLE, "")
    return `<svg${cleaned} width="${width}" height="${height}" preserveAspectRatio="xMidYMid meet">`
  })
}
