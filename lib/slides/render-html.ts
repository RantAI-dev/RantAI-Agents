import type { PresentationData, SlideData } from "./types"

/** Strip markdown syntax that LLMs sometimes inject into slide text */
function cleanText(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")   // ### headings
    .replace(/\*\*\*(.*?)\*\*\*/g, "$1") // ***bold italic***
    .replace(/\*\*(.*?)\*\*/g, "$1")     // **bold**
    .replace(/\*(.*?)\*/g, "$1")         // *italic*
    .replace(/__(.*?)__/g, "$1")         // __underline__
    .replace(/~~(.*?)~~/g, "$1")         // ~~strikethrough~~
    .replace(/`([^`]+)`/g, "$1")         // `inline code`
    .replace(/^>\s+/gm, "")             // > blockquote
    .replace(/^[-*+]\s+/gm, "")         // - list items (when in content/title, not bullets)
    .replace(/^\d+\.\s+/gm, "")         // 1. numbered list
}

function escapeHtml(text: string): string {
  return cleanText(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function renderSlideContent(slide: SlideData, index: number, total: number): string {
  const parts: string[] = []

  switch (slide.layout) {
    case "title":
      parts.push(`<div class="title-content">`)
      if (slide.title) parts.push(`<h1>${escapeHtml(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle) parts.push(`<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`)
      if (slide.note) parts.push(`<p class="footer-text">${escapeHtml(slide.note)}</p>`)
      parts.push(`</div>`)
      break

    case "section":
      parts.push(`<div class="section-content">`)
      if (slide.title) parts.push(`<h1>${escapeHtml(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle) parts.push(`<p class="subtitle">${escapeHtml(slide.subtitle)}</p>`)
      parts.push(`</div>`)
      break

    case "closing":
      parts.push(`<div class="closing-content">`)
      if (slide.title) parts.push(`<h1>${escapeHtml(slide.title)}</h1>`)
      parts.push(`<div class="accent-line"></div>`)
      if (slide.subtitle || slide.content) {
        parts.push(`<p class="subtitle">${escapeHtml(slide.subtitle || slide.content || "")}</p>`)
      }
      parts.push(`</div>`)
      break

    case "content":
    case "image-text":
      parts.push(`<div class="content-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${escapeHtml(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      if (slide.bullets && slide.bullets.length > 0) {
        parts.push(`<ul>${slide.bullets.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul>`)
      }
      if (slide.content) {
        parts.push(`<p class="body-text">${escapeHtml(slide.content)}</p>`)
      }
      parts.push(`</div>`)
      break

    case "two-column":
      parts.push(`<div class="content-layout">`)
      if (slide.title) {
        parts.push(`<div class="content-header">`)
        parts.push(`<div class="title-accent-bar"></div>`)
        parts.push(`<h2>${escapeHtml(slide.title)}</h2>`)
        parts.push(`</div>`)
      }
      parts.push(`<div class="columns">`)
      const left = slide.leftColumn || []
      const right = slide.rightColumn || []
      parts.push(`<div class="column"><ul>${left.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>`)
      parts.push(`<div class="col-divider"></div>`)
      parts.push(`<div class="column"><ul>${right.map((b) => `<li>${escapeHtml(b)}</li>`).join("")}</ul></div>`)
      parts.push(`</div>`)
      parts.push(`</div>`)
      break

    case "quote":
      parts.push(`<div class="quote-layout">`)
      parts.push(`<div class="quote-mark">\u201C</div>`)
      if (slide.quote) parts.push(`<blockquote>${escapeHtml(slide.quote)}</blockquote>`)
      if (slide.attribution) parts.push(`<cite>\u2014 ${escapeHtml(slide.attribution)}</cite>`)
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

function darkenHex(hex: string, amount: number): string {
  const h = hex.replace("#", "")
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  const dr = Math.round(r * (1 - amount))
  const dg = Math.round(g * (1 - amount))
  const db = Math.round(b * (1 - amount))
  return `#${dr.toString(16).padStart(2, "0")}${dg.toString(16).padStart(2, "0")}${db.toString(16).padStart(2, "0")}`
}

export function slidesToHtml(data: PresentationData): string {
  const theme = data.theme
  const slides = data.slides
  const total = slides.length
  const darkerBg = darkenHex(theme.primaryColor, 0.3)

  const sections = slides
    .map((slide, i) => {
      const dark = isDarkSlide(slide.layout)
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

  /* === Base slide === */
  .slide {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 64px 80px;
    opacity: 0;
    transform: translateX(30px);
    transition: opacity 0.45s ease, transform 0.45s ease;
    pointer-events: none;
    background: #FFFFFF;
    color: #1E293B;
  }

  .slide.active {
    opacity: 1;
    transform: translateX(0);
    pointer-events: auto;
  }

  .slide.prev {
    opacity: 0;
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
</style>
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
    if (e.data && e.data.type === 'navigate') {
      var d = e.data.direction;
      if (d === 'next') show(current + 1);
      else if (d === 'prev') show(current - 1);
      else if (typeof d === 'number') show(d);
    }
  });
})();
</script>
</body>
</html>`
}
