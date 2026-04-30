import type { PresentationData, SlideData } from "./types"
import { chartToSvg, inferChartTheme } from "@/lib/rendering/chart-to-svg"
import { cleanMarkdown, darkenColor, CHART_DIMENSIONS } from "./utils"
import { resolveIconsInText, getIconSvg } from "./icons"

/**
 * Client-side fallback for unresolved unsplash: URLs.
 * Normally URLs are resolved server-side before storage.
 * This is a safety net for edge cases.
 */
function resolveImageUrl(url: string): string {
  // URLs should already be resolved server-side
  // This fallback uses placeholder if somehow an unsplash: URL slips through
  if (url.startsWith("unsplash:")) {
    const keyword = url.slice(9).trim()
    const encoded = encodeURIComponent(keyword)
    return `https://placehold.co/1200x800/f1f5f9/64748b?text=${encoded}`
  }
  return url
}

/** Strip markdown syntax that LLMs sometimes inject into slide text */
const cleanText = cleanMarkdown

function escapeHtml(text: string): string {
  return cleanText(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/**
 * Escape HTML then resolve icons.
 * Icons are processed AFTER escaping so SVG tags are preserved.
 * {icon:name} syntax survives HTML escaping since {}, : are not escaped.
 */
function renderText(text: string): string {
  const escaped = escapeHtml(text)
  return resolveIconsInText(escaped)
}

function renderSlideContent(slide: SlideData, index: number, total: number): string {
  const parts: string[] = []

  switch (slide.layout) {
    case "title":
      parts.push(`<div class="title-content">`)
      if (slide.title) parts.push(`<h1>${renderText(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle) parts.push(`<p class="subtitle">${renderText(slide.subtitle)}</p>`)
      if (slide.note) parts.push(`<p class="footer-text">${renderText(slide.note)}</p>`)
      parts.push(`</div>`)
      break

    case "section":
      parts.push(`<div class="section-content">`)
      if (slide.title) parts.push(`<h1>${renderText(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle) parts.push(`<p class="subtitle">${renderText(slide.subtitle)}</p>`)
      parts.push(`</div>`)
      break

    case "closing":
      parts.push(`<div class="closing-content">`)
      if (slide.title) parts.push(`<h1>${renderText(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle || slide.content) {
        parts.push(`<p class="subtitle">${renderText(slide.subtitle || slide.content || "")}</p>`)
      }
      parts.push(`</div>`)
      break

    case "content":
    case "image-text":
      parts.push(`<div class="content-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.bullets && slide.bullets.length > 0) {
        parts.push(`<ul>${slide.bullets.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul>`)
      }
      if (slide.content) {
        parts.push(`<p class="body-text">${renderText(slide.content)}</p>`)
      }
      parts.push(`</div>`)
      break

    case "two-column":
      parts.push(`<div class="content-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      parts.push(`<div class="columns">`)
      const left = slide.leftColumn || []
      const right = slide.rightColumn || []
      parts.push(`<div class="column"><ul>${left.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul></div>`)
      parts.push(`<div class="col-divider"></div>`)
      parts.push(`<div class="column"><ul>${right.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul></div>`)
      parts.push(`</div>`)
      parts.push(`</div>`)
      break

    case "quote":
      const quoteStyle = slide.quoteStyle || "large"
      parts.push(`<div class="quote-layout ${quoteStyle}">`)
      parts.push(`<div class="quote-mark">\u201C</div>`)
      if (slide.quote) parts.push(`<blockquote>${renderText(slide.quote)}</blockquote>`)
      if (slide.attribution || slide.quoteImage) {
        parts.push(`<div class="quote-attribution">`)
        if (slide.quoteImage) {
          const avatarSrc = resolveImageUrl(slide.quoteImage)
          parts.push(`<img src="${escapeHtml(avatarSrc)}" alt="" class="quote-avatar" crossorigin="anonymous" referrerpolicy="no-referrer" />`)
        }
        if (slide.attribution) {
          parts.push(`<cite>\u2014 ${renderText(slide.attribution)}</cite>`)
        }
        parts.push(`</div>`)
      }
      parts.push(`</div>`)
      break

    case "diagram":
      parts.push(`<div class="diagram-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.diagram) {
        // Diagram code should NOT have icons resolved - it's Mermaid syntax
        parts.push(`<div class="mermaid-diagram">${escapeHtml(slide.diagram)}</div>`)
      }
      parts.push(`</div>`)
      break

    case "image":
      parts.push(`<div class="image-layout">`)
      if (slide.imageUrl) {
        const imgSrc = resolveImageUrl(slide.imageUrl)
        parts.push(`<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(slide.imageCaption || slide.title || "Slide image")}" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy" />`)
      }
      if (slide.imageCaption) {
        parts.push(`<p class="caption">${renderText(slide.imageCaption)}</p>`)
      }
      parts.push(`</div>`)
      break

    case "chart":
      parts.push(`<div class="chart-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.chart) {
        const chartSvg = chartToSvg(slide.chart, CHART_DIMENSIONS.html.fullSlide.width, CHART_DIMENSIONS.html.fullSlide.height, { theme: inferChartTheme(theme.primaryColor) })
        parts.push(`<div class="chart-container">${chartSvg}</div>`)
      }
      parts.push(`</div>`)
      break

    case "diagram-content":
      parts.push(`<div class="split-layout">`)
      parts.push(`<div class="visual-side">`)
      if (slide.diagram) {
        // Diagram code should NOT have icons resolved - it's Mermaid syntax
        parts.push(`<div class="mermaid-diagram">${escapeHtml(slide.diagram)}</div>`)
      }
      parts.push(`</div>`)
      parts.push(`<div class="content-side">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.bullets && slide.bullets.length > 0) {
        parts.push(`<ul>${slide.bullets.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul>`)
      }
      if (slide.content) {
        parts.push(`<p class="body-text">${renderText(slide.content)}</p>`)
      }
      parts.push(`</div>`)
      parts.push(`</div>`)
      break

    case "image-content":
      parts.push(`<div class="split-layout">`)
      parts.push(`<div class="visual-side">`)
      if (slide.imageUrl) {
        const imgSrc = resolveImageUrl(slide.imageUrl)
        parts.push(`<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(slide.title || "Slide image")}" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy" />`)
      }
      parts.push(`</div>`)
      parts.push(`<div class="content-side">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.bullets && slide.bullets.length > 0) {
        parts.push(`<ul>${slide.bullets.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul>`)
      }
      if (slide.content) {
        parts.push(`<p class="body-text">${renderText(slide.content)}</p>`)
      }
      parts.push(`</div>`)
      parts.push(`</div>`)
      break

    case "chart-content":
      parts.push(`<div class="split-layout">`)
      parts.push(`<div class="visual-side">`)
      if (slide.chart) {
        const chartSvg = chartToSvg(slide.chart, CHART_DIMENSIONS.html.splitLayout.width, CHART_DIMENSIONS.html.splitLayout.height, { theme: inferChartTheme(theme.primaryColor) })
        parts.push(`<div class="chart-container">${chartSvg}</div>`)
      }
      parts.push(`</div>`)
      parts.push(`<div class="content-side">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.bullets && slide.bullets.length > 0) {
        parts.push(`<ul>${slide.bullets.map((b) => `<li>${renderText(b)}</li>`).join("")}</ul>`)
      }
      if (slide.content) {
        parts.push(`<p class="body-text">${renderText(slide.content)}</p>`)
      }
      parts.push(`</div>`)
      parts.push(`</div>`)
      break

    case "hero":
      // Hero layout handled specially - background set via inline style
      parts.push(`<div class="hero-content">`)
      if (slide.title) parts.push(`<h1>${renderText(slide.title)}</h1>`)
      if (slide.subtitle) parts.push(`<p class="subtitle">${renderText(slide.subtitle)}</p>`)
      parts.push(`</div>`)
      break

    case "stats":
      parts.push(`<div class="stats-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.stats && slide.stats.length > 0) {
        parts.push(`<div class="stats-grid">`)
        for (const stat of slide.stats) {
          const trendClass = stat.trend === "up" ? " up" : stat.trend === "down" ? " down" : ""
          const trendIcon = stat.trend === "up" ? "↑" : stat.trend === "down" ? "↓" : ""
          parts.push(`<div class="stat-item">`)
          parts.push(`<div class="stat-value">${renderText(stat.value)}</div>`)
          parts.push(`<div class="stat-label">${renderText(stat.label)}</div>`)
          if (stat.change) {
            parts.push(`<div class="stat-change${trendClass}">${trendIcon} ${renderText(stat.change)}</div>`)
          }
          parts.push(`</div>`)
        }
        parts.push(`</div>`)
      }
      parts.push(`</div>`)
      break

    case "gallery":
      parts.push(`<div class="gallery-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.gallery && slide.gallery.length > 0) {
        // Auto-calculate columns based on item count if not specified
        const cols = slide.galleryColumns || (slide.gallery.length <= 4 ? 2 : slide.gallery.length <= 6 ? 3 : 4)
        parts.push(`<div class="gallery-grid cols-${cols}">`)
        for (const item of slide.gallery) {
          const imgSrc = resolveImageUrl(item.imageUrl)
          parts.push(`<div class="gallery-item">`)
          parts.push(`<img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(item.caption || "")}" crossorigin="anonymous" referrerpolicy="no-referrer" loading="lazy" />`)
          if (item.caption) {
            parts.push(`<span class="gallery-caption">${renderText(item.caption)}</span>`)
          }
          parts.push(`</div>`)
        }
        parts.push(`</div>`)
      }
      parts.push(`</div>`)
      break

    case "comparison":
      parts.push(`<div class="comparison-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.comparisonHeaders && slide.comparisonRows) {
        parts.push(`<table class="comparison-table">`)
        parts.push(`<thead><tr>`)
        for (const header of slide.comparisonHeaders) {
          parts.push(`<th>${renderText(header)}</th>`)
        }
        parts.push(`</tr></thead>`)
        parts.push(`<tbody>`)
        for (const row of slide.comparisonRows) {
          parts.push(`<tr>`)
          parts.push(`<td class="feature-cell">${renderText(row.feature)}</td>`)
          for (const val of row.values) {
            if (val === true) {
              parts.push(`<td class="check-cell yes">✓</td>`)
            } else if (val === false) {
              parts.push(`<td class="check-cell no">✗</td>`)
            } else {
              parts.push(`<td>${renderText(String(val))}</td>`)
            }
          }
          parts.push(`</tr>`)
        }
        parts.push(`</tbody></table>`)
      }
      parts.push(`</div>`)
      break

    case "features":
      parts.push(`<div class="features-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${renderText(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.features && slide.features.length > 0) {
        const cols = slide.featuresColumns || (slide.features.length <= 3 ? slide.features.length : 3)
        parts.push(`<div class="features-grid cols-${cols}">`)
        for (const feature of slide.features) {
          const iconSvg = getIconSvg(feature.icon)
          parts.push(`<div class="feature-item">`)
          parts.push(`<div class="feature-icon">${iconSvg || ""}</div>`)
          parts.push(`<h3 class="feature-title">${renderText(feature.title)}</h3>`)
          if (feature.description) {
            parts.push(`<p class="feature-desc">${renderText(feature.description)}</p>`)
          }
          parts.push(`</div>`)
        }
        parts.push(`</div>`)
      }
      parts.push(`</div>`)
      break
  }

  // Slide number on all slides
  parts.push(`<div class="slide-num">Page ${index + 1} / ${total}</div>`)

  return parts.join("\n")
}

function isDarkSlide(layout: string): boolean {
  return layout === "title" || layout === "section" || layout === "closing"
}

export function slidesToHtml(data: PresentationData): string {
  const theme = data.theme
  const slides = data.slides
  const total = slides.length
  const darkerBg = darkenColor(theme.primaryColor, 0.3)

  const sections = slides
    .map((slide, i) => {
      const dark = isDarkSlide(slide.layout)
      // Hero layout needs special handling for background image and overlay
      if (slide.layout === "hero") {
        const bgImage = slide.backgroundImage ? resolveImageUrl(slide.backgroundImage) : ""
        const overlay = slide.overlay || "dark"
        const overlayClass = overlay === "none" ? " overlay-none" : overlay === "light" ? " overlay-light" : ""
        const bgStyle = bgImage ? ` style="background-image: url('${bgImage.replace(/'/g, "\\'")}')"` : ""
        return `<section class="slide hero${overlayClass}"${bgStyle} data-index="${i}">${renderSlideContent(slide, i, total)}</section>`
      }
      return `<section class="slide ${slide.layout}${dark ? " dark" : ""}" data-index="${i}">${renderSlideContent(slide, i, total)}</section>`
    })
    .join("\n")

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: ${theme.fontFamily};
    overflow: hidden;
    background: ${theme.primaryColor};
    width: 100vw;
    height: 100vh;
  }

  /* === Design tokens === */
  :root {
    --shadow-sm: 0 2px 8px rgba(0,0,0,0.08);
    --shadow-md: 0 4px 16px rgba(0,0,0,0.12);
    --shadow-lg: 0 8px 32px rgba(0,0,0,0.16);
    --radius-sm: 8px;
    --radius-md: 12px;
    --radius-lg: 16px;
  }

  /* === Base slide === */
  .slide {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 64px 80px;
    opacity: 0;
    pointer-events: none;
    background: #FFFFFF;
    color: #1E293B;
  }

  /* Entry animation - excluded for hero slides (full-bleed backgrounds) */
  .slide:not(.hero) {
    transform: translateX(30px);
    transition: opacity 0.45s ease, transform 0.45s ease;
  }

  .slide.hero {
    transition: opacity 0.45s ease;
  }

  .slide.active {
    opacity: 1;
    pointer-events: auto;
  }

  .slide:not(.hero).active {
    transform: translateX(0);
  }

  .slide.prev {
    opacity: 0;
  }

  .slide:not(.hero).prev {
    transform: translateX(-30px);
  }

  /* === Dark slides (title, section, closing) === */
  .slide.dark {
    background: linear-gradient(160deg, ${theme.primaryColor} 0%, ${darkerBg} 100%);
    color: #F8FAFC;
    justify-content: center;
    align-items: center;
    text-align: center;
  }

  /* === Accent line === */
  .accent-line {
    width: 64px;
    height: 3px;
    background: ${theme.secondaryColor};
    margin: 20px auto;
    border-radius: 2px;
  }

  .content-layout .accent-line {
    margin: 12px 0;
  }

  /* === Title slide === */
  .title-content, .section-content, .closing-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    width: 100%;
  }

  .slide.dark h1 {
    font-size: clamp(32px, 5vw, 56px);
    font-weight: 700;
    line-height: 1.15;
    color: #FFFFFF;
    letter-spacing: -0.02em;
    max-width: 85%;
  }

  .slide.dark .subtitle {
    font-size: clamp(14px, 2vw, 22px);
    font-weight: 300;
    color: rgba(255,255,255,0.6);
    margin-top: 4px;
    max-width: 70%;
    line-height: 1.5;
  }

  .footer-text {
    position: absolute;
    bottom: 40px;
    font-size: 13px;
    font-weight: 400;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.05em;
  }

  /* === Content slides === */
  .content-layout {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
  }

  .content-header {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 32px;
  }

  .title-accent-bar {
    width: 4px;
    height: 32px;
    background: ${theme.secondaryColor};
    border-radius: 2px;
    flex-shrink: 0;
  }

  .content-layout h2 {
    font-size: clamp(22px, 3vw, 34px);
    font-weight: 600;
    line-height: 1.2;
    color: ${theme.primaryColor};
    letter-spacing: -0.01em;
  }

  .body-text {
    font-size: clamp(14px, 1.5vw, 18px);
    line-height: 1.8;
    color: #475569;
  }

  /* === Bullets === */
  ul {
    list-style: none;
    width: 100%;
  }

  ul li {
    font-size: clamp(14px, 1.5vw, 18px);
    line-height: 1.5;
    color: #334155;
    padding: 10px 0 10px 32px;
    position: relative;
    border-bottom: 1px solid rgba(0,0,0,0.04);
  }

  ul li:last-child {
    border-bottom: none;
  }

  ul li::before {
    content: '';
    position: absolute;
    left: 6px;
    top: 18px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: ${theme.secondaryColor};
    opacity: 0.7;
  }

  .slide.dark ul li { color: rgba(255,255,255,0.85); border-bottom-color: rgba(255,255,255,0.06); }
  .slide.dark ul li::before { background: ${theme.secondaryColor}; opacity: 0.9; }

  /* === Two columns === */
  .columns {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    gap: 24px;
    width: 100%;
    flex: 1;
    align-items: start;
  }

  .col-divider {
    width: 1px;
    background: rgba(0,0,0,0.08);
    align-self: stretch;
    margin: 0 8px;
  }

  .slide.dark .col-divider { background: rgba(255,255,255,0.1); }

  /* === Quote === */
  .quote-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    width: 100%;
    height: 100%;
  }

  .quote-mark {
    font-size: 80px;
    line-height: 1;
    color: ${theme.secondaryColor};
    opacity: 0.25;
    font-family: Georgia, serif;
    margin-bottom: -16px;
  }

  blockquote {
    font-size: clamp(18px, 2.5vw, 28px);
    font-weight: 400;
    font-style: italic;
    line-height: 1.6;
    color: #334155;
    max-width: 75%;
    margin-bottom: 20px;
  }

  cite {
    font-size: clamp(13px, 1.3vw, 16px);
    color: ${theme.secondaryColor};
    font-style: normal;
    font-weight: 500;
  }

  /* Quote attribution with avatar */
  .quote-attribution {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
    margin-top: 24px;
  }

  .quote-avatar {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: var(--shadow-sm);
  }

  /* Quote style variants */
  .quote-layout.minimal .quote-mark {
    font-size: 48px;
    opacity: 0.15;
  }

  .quote-layout.minimal blockquote {
    font-size: clamp(16px, 2vw, 22px);
  }

  .quote-layout.card {
    background: #f8fafc;
    border-radius: var(--radius-lg);
    padding: 48px;
    box-shadow: var(--shadow-md);
    max-width: 80%;
    margin: auto;
  }

  .quote-layout.card .quote-mark {
    font-size: 60px;
  }

  /* === Slide number === */
  .slide-num {
    position: absolute;
    bottom: 20px;
    right: 28px;
    font-size: 11px;
    font-weight: 500;
    color: rgba(0,0,0,0.25);
    letter-spacing: 0.04em;
  }

  .slide.dark .slide-num {
    color: rgba(255,255,255,0.3);
  }

  /* === Progress bar === */
  .progress {
    position: fixed;
    bottom: 0;
    left: 0;
    height: 2px;
    background: ${theme.secondaryColor};
    transition: width 0.45s ease;
    z-index: 10;
  }

  /* === Visual layouts === */

  /* Diagram layout */
  .diagram-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    height: 100%;
    width: 100%;
  }

  .diagram-layout .content-header {
    margin-bottom: 24px;
    align-self: flex-start;
  }

  .mermaid-diagram {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    width: 100%;
    min-height: 300px;
    max-height: 70vh;
    overflow: visible;
  }

  .mermaid-diagram svg {
    width: 100% !important;
    max-width: 100%;
    height: auto !important;
    max-height: 100%;
  }

  /* Image layout */
  .image-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    width: 100%;
  }

  .image-layout img {
    max-width: 90%;
    max-height: 65vh;
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    transition: box-shadow 0.3s ease;
  }

  .image-layout img:hover {
    box-shadow: var(--shadow-lg), 0 0 0 2px rgba(59, 130, 246, 0.15);
  }

  .image-layout .caption {
    font-size: 14px;
    color: #64748b;
    margin-top: 16px;
    font-style: italic;
  }

  /* Chart layout */
  .chart-layout {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    height: 100%;
    width: 100%;
  }

  .chart-layout .content-header {
    margin-bottom: 24px;
    align-self: flex-start;
  }

  .chart-container {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    max-width: 100%;
    background: #fafafa;
    border-radius: var(--radius-md);
    padding: 24px;
    box-shadow: var(--shadow-sm);
  }

  .chart-container svg {
    max-width: 100%;
    height: auto;
  }

  /* Split layouts (visual + content) */
  .split-layout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 48px;
    height: 100%;
    width: 100%;
    align-items: center;
  }

  .split-layout .visual-side {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .split-layout .visual-side img {
    max-width: 100%;
    max-height: 60vh;
    object-fit: contain;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
    transition: box-shadow 0.3s ease, transform 0.3s ease;
  }

  .split-layout .visual-side img:hover {
    box-shadow: var(--shadow-lg), 0 0 0 2px rgba(59, 130, 246, 0.15);
    transform: scale(1.01);
  }

  .split-layout .visual-side .mermaid-diagram {
    width: 100%;
    min-height: 200px;
    max-height: 60vh;
  }

  .split-layout .visual-side .mermaid-diagram svg {
    width: 100% !important;
    height: auto !important;
  }

  .split-layout .visual-side .chart-container svg {
    max-height: 55vh;
  }

  .split-layout .content-side {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }

  .split-layout .content-side .content-header {
    margin-bottom: 20px;
  }

  /* Hero layout - full-bleed background */
  .slide.hero {
    padding: 0;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    min-height: 100vh;
  }

  .slide.hero::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.6) 100%);
    z-index: 1;
  }

  .slide.hero.overlay-light::before {
    background: linear-gradient(to bottom, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.6) 100%);
  }

  .slide.hero.overlay-none::before {
    display: none;
  }

  .hero-content {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    width: 100%;
    height: 100%;
    min-height: 100vh;
    padding: 64px 80px;
    box-sizing: border-box;
  }

  .slide.hero h1 {
    font-size: clamp(36px, 6vw, 64px);
    font-weight: 700;
    color: white;
    text-shadow: 0 2px 8px rgba(0,0,0,0.3);
    max-width: 80%;
    line-height: 1.1;
  }

  .slide.hero .subtitle {
    font-size: clamp(16px, 2.5vw, 26px);
    font-weight: 300;
    color: rgba(255,255,255,0.9);
    text-shadow: 0 1px 4px rgba(0,0,0,0.3);
    margin-top: 16px;
    max-width: 70%;
  }

  .slide.hero.overlay-light h1 {
    color: #1e293b;
    text-shadow: 0 1px 2px rgba(255,255,255,0.5);
  }

  .slide.hero.overlay-light .subtitle {
    color: #475569;
    text-shadow: none;
  }

  /* Stats layout */
  .stats-layout {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
  }

  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 40px;
    padding: 40px 20px;
    flex: 1;
    align-content: center;
  }

  .stat-item {
    text-align: center;
    padding: 24px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .stat-item:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }

  .stat-value {
    font-size: clamp(36px, 6vw, 56px);
    font-weight: 700;
    color: ${theme.secondaryColor};
    line-height: 1.1;
    letter-spacing: -0.02em;
  }

  .stat-label {
    font-size: clamp(14px, 1.5vw, 18px);
    color: #64748b;
    margin-top: 8px;
    font-weight: 500;
  }

  .stat-change {
    font-size: 14px;
    margin-top: 8px;
    font-weight: 600;
    color: #64748b;
  }

  .stat-change.up {
    color: #22c55e;
  }

  .stat-change.down {
    color: #ef4444;
  }

  /* Gallery layout */
  .gallery-layout {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
  }

  .gallery-grid {
    display: grid;
    gap: 24px;
    padding: 24px 0;
    flex: 1;
    align-content: center;
  }

  .gallery-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .gallery-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .gallery-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }
  .gallery-grid.cols-5 { grid-template-columns: repeat(5, 1fr); }
  .gallery-grid.cols-6 { grid-template-columns: repeat(6, 1fr); }

  .gallery-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .gallery-item img {
    width: 100%;
    height: auto;
    max-height: 120px;
    object-fit: contain;
    filter: grayscale(100%);
    opacity: 0.7;
    transition: all 0.3s ease;
    border-radius: var(--radius-sm);
  }

  .gallery-item:hover img {
    filter: grayscale(0%);
    opacity: 1;
    transform: scale(1.05);
  }

  .gallery-caption {
    font-size: 12px;
    color: #64748b;
    text-align: center;
  }

  /* Comparison layout */
  .comparison-layout {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
  }

  .comparison-table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 16px;
    font-size: clamp(12px, 1.3vw, 16px);
  }

  .comparison-table th {
    background: ${theme.primaryColor};
    color: white;
    padding: 12px 16px;
    text-align: center;
    font-weight: 600;
    border: 1px solid ${theme.primaryColor};
  }

  .comparison-table th:first-child {
    text-align: left;
    border-radius: var(--radius-sm) 0 0 0;
  }

  .comparison-table th:last-child {
    border-radius: 0 var(--radius-sm) 0 0;
  }

  .comparison-table td {
    padding: 12px 16px;
    border: 1px solid #e2e8f0;
    text-align: center;
  }

  .comparison-table tbody tr:nth-child(odd) {
    background: #f8fafc;
  }

  .comparison-table tbody tr:nth-child(even) {
    background: white;
  }

  .comparison-table .feature-cell {
    text-align: left;
    font-weight: 500;
    color: #334155;
  }

  .comparison-table .check-cell {
    font-size: 1.2em;
    font-weight: 700;
  }

  .comparison-table .check-cell.yes {
    color: #22c55e;
  }

  .comparison-table .check-cell.no {
    color: #ef4444;
  }

  /* Features layout (icon grid) */
  .features-layout {
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
  }

  .features-grid {
    display: grid;
    gap: 32px;
    padding: 32px 0;
    flex: 1;
    align-content: center;
  }

  .features-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
  .features-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
  .features-grid.cols-4 { grid-template-columns: repeat(4, 1fr); }

  .feature-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    padding: 24px 16px;
    background: linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-sm);
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .feature-item:hover {
    transform: translateY(-4px);
    box-shadow: var(--shadow-md);
  }

  .feature-icon {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: ${theme.secondaryColor};
    border-radius: 50%;
    margin-bottom: 16px;
    box-shadow: 0 4px 12px ${theme.secondaryColor}40;
  }

  .feature-icon svg {
    width: 28px;
    height: 28px;
    stroke: white;
  }

  .feature-title {
    font-size: clamp(16px, 2vw, 20px);
    font-weight: 600;
    color: ${theme.primaryColor};
    margin-bottom: 8px;
  }

  .feature-desc {
    font-size: clamp(12px, 1.3vw, 14px);
    color: #64748b;
    line-height: 1.5;
    max-width: 200px;
  }

  /* V2 Polish - Images in all layouts get subtle styling */
  .slide img:not(.hero img):not(.gallery-item img):not(.quote-avatar) {
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-lg);
  }

  /* Inline icons */
  .slide-icon {
    display: inline-block;
    vertical-align: -0.125em;
    width: 1em;
    height: 1em;
    margin: 0 0.15em;
    flex-shrink: 0;
  }

  /* Icon color inherits from parent text */
  .slide-icon {
    stroke: currentColor;
  }

  /* Larger icons in headings */
  h1 .slide-icon, h2 .slide-icon {
    width: 0.9em;
    height: 0.9em;
  }

  /* Stats icons */
  .stat-value .slide-icon {
    width: 0.8em;
    height: 0.8em;
    vertical-align: -0.1em;
  }
</style>
<script type="module">
  import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      background: '#ffffff',
      primaryColor: '#f8fafc',
      primaryTextColor: '#1e293b',
      primaryBorderColor: '#cbd5e1',
      lineColor: '#64748b',
      secondaryColor: '#e2e8f0',
      tertiaryColor: '#f1f5f9',
      textColor: '#1e293b',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '16px'
    },
    flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 20, nodeSpacing: 50, rankSpacing: 60 },
    sequence: { useMaxWidth: true, mirrorActors: true, actorMargin: 80, messageMargin: 40, boxMargin: 20 },
    gantt: { useMaxWidth: true },
    pie: { useMaxWidth: true }
  });
  document.querySelectorAll('.mermaid-diagram').forEach(async (el) => {
    const id = 'mermaid-' + Math.random().toString(36).slice(2);
    try {
      const { svg } = await mermaid.render(id, el.textContent.trim());
      el.innerHTML = svg;
      // Ensure SVG fills container properly
      const svgEl = el.querySelector('svg');
      if (svgEl) {
        svgEl.removeAttribute('height');
        svgEl.style.width = '100%';
        svgEl.style.height = 'auto';
        svgEl.style.maxHeight = '100%';
      }
    } catch (err) {
      el.innerHTML = '<div style="color:#ef4444;font-size:14px;">Diagram error: ' + err.message + '</div>';
    }
  });
</script>
</head>
<body>
${sections}
<div class="progress" id="progress"></div>
<script>
(function() {
  var slides = document.querySelectorAll('.slide');
  var total = slides.length;
  var current = 0;

  function show(idx) {
    if (idx < 0 || idx >= total) return;
    slides.forEach(function(s, i) {
      s.classList.remove('active', 'prev');
      if (i === idx) s.classList.add('active');
      else if (i < idx) s.classList.add('prev');
    });
    current = idx;
    document.getElementById('progress').style.width = ((current + 1) / total * 100) + '%';
    parent.postMessage({ type: 'slideChange', current: current, total: total }, '*');
  }

  show(0);

  document.addEventListener('keydown', function(e) {
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); show(current + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); show(current - 1); }
    if (e.key === 'Home') { e.preventDefault(); show(0); }
    if (e.key === 'End') { e.preventDefault(); show(total - 1); }
  });

  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'navigate') return;
    // Standardized contract — direction "next"/"prev" for relative,
    // index <number> for absolute jumps. Legacy direction:<number> still
    // accepted so older clients keep working.
    var d = e.data.direction;
    if (typeof e.data.index === 'number') { show(e.data.index); return; }
    if (d === 'next') show(current + 1);
    else if (d === 'prev') show(current - 1);
    else if (typeof d === 'number') show(d);
  });
})();
</script>
</body>
</html>`
}
