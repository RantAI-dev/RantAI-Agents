"use client"

import { useMemo, useRef, useCallback, useEffect, useState } from "react"
import { Loader2 } from "lucide-react"

interface HtmlRendererProps {
  content: string
}

const TAILWIND_CDN = '<script src="https://cdn.tailwindcss.com"><\/script>'
const INTER_FONT =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">'

// Best-effort JS navigation blockers (may be ignored by some browsers)
const PREVENT_NAV_SCRIPT = `<script>
Location.prototype.assign=function(){};
Location.prototype.replace=function(){};
Location.prototype.reload=function(){};
try{var _hd=Object.getOwnPropertyDescriptor(Location.prototype,'href');Object.defineProperty(Location.prototype,'href',{get:_hd?_hd.get:function(){return '';},set:function(){},configurable:true});}catch(e){}
try{var _cl=window.location;Object.defineProperty(window,'location',{get:function(){return _cl;},set:function(){},configurable:true});}catch(e){}
document.addEventListener('click',function(e){var a=e.target.closest('a');if(a){var h=a.getAttribute('href');if(h&&!h.startsWith('#')&&!h.startsWith('javascript:')){e.preventDefault();e.stopImmediatePropagation();}}},true);
document.addEventListener('submit',function(e){e.preventDefault();e.stopImmediatePropagation();},true);
var _p=history.pushState.bind(history),_r=history.replaceState.bind(history);
history.pushState=function(s,t){try{_p(s,t,'');}catch(e){}};
history.replaceState=function(s,t){try{_r(s,t,'');}catch(e){}};
window.open=function(){return null;};
<\/script>`

/**
 * Inject Tailwind CDN + Google Fonts into an HTML document if not already present.
 * Security relies on iframe sandbox (allow-scripts) — no DOMPurify needed.
 */
function injectDefaults(html: string): string {
  const hasTailwind = /cdn\.tailwindcss\.com|tailwindcss/i.test(html)
  const hasInterFont = /fonts\.googleapis\.com.*Inter/i.test(html)

  // Full HTML document — inject into <head>
  if (/<head[\s>]/i.test(html)) {
    let result = html
    // Navigation prevention must be first (before any user scripts)
    result = result.replace(/<head([^>]*)>/i, `<head$1>\n${PREVENT_NAV_SCRIPT}`)
    if (!hasTailwind) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>\n${TAILWIND_CDN}`)
    }
    if (!hasInterFont) {
      result = result.replace(/<head([^>]*)>/i, `<head$1>\n${INTER_FONT}`)
    }
    return result
  }

  // Partial HTML — wrap in a full document
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${hasTailwind ? "" : TAILWIND_CDN}
  ${hasInterFont ? "" : INTER_FONT}
  <style>
    body { margin: 0; padding: 16px; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
    *, *::before, *::after { box-sizing: border-box; }
  </style>
  ${PREVENT_NAV_SCRIPT}
</head>
<body>${html}</body>
</html>`
}

export function HtmlRenderer({ content }: HtmlRendererProps) {
  const srcdoc = useMemo(() => injectDefaults(content), [content])
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const initialLoadDone = useRef(false)
  const restoring = useRef(false)
  const [loading, setLoading] = useState(true)

  // Reset load tracking when content changes
  useEffect(() => {
    initialLoadDone.current = false
    setLoading(true)
  }, [srcdoc])

  // Detect iframe navigation and restore srcDoc
  const handleLoad = useCallback(() => {
    if (!initialLoadDone.current) {
      initialLoadDone.current = true
      setLoading(false)
      return
    }
    if (restoring.current) {
      restoring.current = false
      return
    }
    // The iframe navigated away from srcDoc — force restore
    if (iframeRef.current) {
      restoring.current = true
      iframeRef.current.srcdoc = srcdoc
    }
  }, [srcdoc])

  return (
    <div className="relative w-full h-full">
      {loading && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading preview...</span>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        onLoad={handleLoad}
        sandbox="allow-scripts allow-modals"
        className="w-full h-full border-0 bg-white"
        style={{ minHeight: "100%" }}
        title="HTML Artifact Preview"
      />
    </div>
  )
}
