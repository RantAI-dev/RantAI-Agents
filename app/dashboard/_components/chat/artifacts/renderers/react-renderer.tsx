"use client"

import { useMemo, useEffect, useState, useCallback, useRef } from "react"
import { AlertTriangle, RotateCcw, Code, Loader2 } from "lucide-react"

interface ReactRendererProps {
  content: string
}

/* ── Import/export mapping ──────────────────────────────────── */

const IMPORT_GLOBALS: Record<string, string> = {
  react: "React",
  recharts: "Recharts",
  "lucide-react": "LucideReact",
  "framer-motion": "Motion",
}

/**
 * Transform ES module imports → global destructuring and strip exports.
 * Returns processed code + detected component name.
 *
 * NOTE: React hooks/APIs are already destructured in the iframe template,
 * so we skip generating preamble for 'react' imports entirely.
 */
function preprocessCode(code: string): {
  processedCode: string
  componentName: string
  unsupportedImports: string[]
} {
  const preamble: string[] = []
  const unsupportedImports: string[] = []
  let componentName = "App"

  let processed = code

  // Hide template literal contents to avoid matching imports inside strings
  const tplStore: string[] = []
  processed = processed.replace(/`[^`]*`/gs, (match) => {
    tplStore.push(match)
    return `"__TPL_${tplStore.length - 1}__"`
  })

  // Collapse multi-line imports into single lines so the regex below can match them
  processed = processed.replace(
    /import\s*\{([^}]+)\}\s*from/gs,
    (_m, names: string) => `import {${names.replace(/\n/g, " ")}} from`
  )

  // Handle: import React from 'react'  (default import)
  // Handle: import { useState, useEffect } from 'react'  (named imports)
  // Handle: import React, { useState } from 'react'  (mixed)
  // Handle: import * as Recharts from 'recharts'  (namespace)
  processed = processed.replace(
    /^\s*import\s+(.+?)\s+from\s+['"]([^'"]+)['"]\s*;?\s*$/gm,
    (_match, imports: string, source: string) => {
      const global = IMPORT_GLOBALS[source]
      if (!global) {
        unsupportedImports.push(source)
        return `// unsupported import: ${source}`
      }

      // React hooks are already destructured in the template — skip entirely
      if (source === "react") return ""

      const trimmed = imports.trim()

      // import * as X from '...'
      const nsMatch = trimmed.match(/^\*\s+as\s+(\w+)$/)
      if (nsMatch) {
        if (nsMatch[1] !== global) preamble.push(`const ${nsMatch[1]} = ${global};`)
        return ""
      }

      // import Default, { named1, named2 } from '...'
      const mixedMatch = trimmed.match(/^(\w+)\s*,\s*\{([^}]+)\}$/)
      if (mixedMatch) {
        if (mixedMatch[1] !== global) preamble.push(`const ${mixedMatch[1]} = ${global};`)
        preamble.push(`const {${mixedMatch[2]}} = ${global};`)
        return ""
      }

      // import { named1, named2 } from '...'
      const namedMatch = trimmed.match(/^\{([^}]+)\}$/)
      if (namedMatch) {
        preamble.push(`const {${namedMatch[1]}} = ${global};`)
        return ""
      }

      // import Default from '...'
      if (trimmed !== global) preamble.push(`const ${trimmed} = ${global};`)
      return ""
    }
  )

  // Strip: import '...' or import "..." (side-effect imports like CSS)
  processed = processed.replace(
    /^\s*import\s+['"][^'"]+['"]\s*;?\s*$/gm,
    ""
  )

  // Handle: export default function Name(...)
  processed = processed.replace(
    /export\s+default\s+function\s+(\w+)/g,
    (_m, name) => {
      componentName = name
      return `function ${name}`
    }
  )

  // Handle: export default class Name
  processed = processed.replace(
    /export\s+default\s+class\s+(\w+)/g,
    (_m, name) => {
      componentName = name
      return `class ${name}`
    }
  )

  // Handle: const App = () => { ... }; export default App
  const defaultExportMatch = processed.match(
    /export\s+default\s+(\w+)\s*;?\s*$/m
  )
  if (defaultExportMatch) {
    componentName = defaultExportMatch[1]
    processed = processed.replace(/export\s+default\s+\w+\s*;?\s*$/m, "")
  }

  // Handle: export default () => ... (anonymous arrow)
  processed = processed.replace(
    /export\s+default\s*(\([^)]*\)\s*=>)/g,
    (_m, arrow) => {
      componentName = "App"
      return `const App = ${arrow}`
    }
  )

  // Handle: export default memo(...) or export default forwardRef(...)
  processed = processed.replace(
    /export\s+default\s+(memo|forwardRef)\s*\(/g,
    (_m, wrapper) => {
      componentName = "App"
      return `const App = ${wrapper}(`
    }
  )

  // Strip remaining export statements
  processed = processed.replace(/^\s*export\s+/gm, "")

  // If no component found, try to detect from const/function declarations
  if (componentName === "App" && !processed.includes("function App") && !processed.includes("const App")) {
    const fnMatch = processed.match(/(?:function|const)\s+([A-Z]\w*)/)
    if (fnMatch) componentName = fnMatch[1]
  }

  // Restore template literals that were hidden during import processing
  tplStore.forEach((tpl, i) => {
    processed = processed.replace(`"__TPL_${i}__"`, tpl)
  })

  const finalCode = preamble.join("\n") + "\n\n" + processed

  return { processedCode: finalCode.trim(), componentName, unsupportedImports }
}

/* ── HTML template for the sandboxed iframe ─────────────────── */

function buildSrcdoc(code: string, componentName: string): string {
  // Escape </script> inside user code to prevent breaking out of the script tag
  const escapedCode = code.replace(/<\/script>/gi, "<\\/script>")

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<script src="https://cdn.tailwindcss.com"><\/script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
<script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"><\/script>
<script crossorigin src="https://unpkg.com/@babel/standalone/babel.min.js"><\/script>
<script crossorigin src="https://unpkg.com/recharts@2/umd/Recharts.min.js"><\/script>
<script>window.react = window.React;<\/script>
<script crossorigin src="https://unpkg.com/lucide-react@0.454.0/dist/umd/lucide-react.js"><\/script>
<script crossorigin src="https://unpkg.com/framer-motion@11/dist/framer-motion.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; }
  body { margin: 0; font-family: 'Inter', system-ui, -apple-system, sans-serif; }
  #root { min-height: 100vh; }
</style>
</head>
<body>
<div id="root"></div>
<div id="error-display" style="display:none;padding:16px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;margin:16px;font-family:monospace;">
  <p style="color:#dc2626;font-weight:600;margin:0 0 8px;">Render Error</p>
  <pre id="error-message" style="color:#991b1b;font-size:12px;white-space:pre-wrap;margin:0;"></pre>
</div>
<script>
// Block all navigation attempts in preview iframe (must run before user code)
// 1. Override Location.prototype to block location.href=, location.assign(), etc.
Location.prototype.assign = function() {};
Location.prototype.replace = function() {};
Location.prototype.reload = function() {};
try {
  var _hd = Object.getOwnPropertyDescriptor(Location.prototype, 'href');
  Object.defineProperty(Location.prototype, 'href', {
    get: _hd ? _hd.get : function() { return ''; },
    set: function() {},
    configurable: true
  });
} catch(e) {}
try {
  var _cl = window.location;
  Object.defineProperty(window, 'location', {
    get: function() { return _cl; },
    set: function() {},
    configurable: true
  });
} catch(e) {}
// 2. Intercept link clicks (capture phase to fire before React)
document.addEventListener('click', function(e) {
  var a = e.target.closest('a');
  if (a) {
    var h = a.getAttribute('href');
    if (h && !h.startsWith('#') && !h.startsWith('javascript:')) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  }
}, true);
// 3. Block form submissions
document.addEventListener('submit', function(e) {
  e.preventDefault();
  e.stopImmediatePropagation();
}, true);
// 4. Override history API to prevent React Router navigation
var _origPush = history.pushState.bind(history);
var _origReplace = history.replaceState.bind(history);
history.pushState = function(s, t) { try { _origPush(s, t, ''); } catch(e){} };
history.replaceState = function(s, t) { try { _origReplace(s, t, ''); } catch(e){} };
// 5. Block window.open
window.open = function() { return null; };
<\/script>
<script type="text/babel" data-presets="react">
try {
  // React APIs — available to all components
  const { useState, useEffect, useRef, useMemo, useCallback, useContext, useReducer, useId, useTransition, useDeferredValue, useSyncExternalStore, useInsertionEffect, useLayoutEffect, createContext, forwardRef, memo, Fragment, Suspense, lazy, startTransition, Children, cloneElement, createElement, isValidElement } = React;

  ${escapedCode}

  const _Component = typeof ${componentName} !== 'undefined' ? ${componentName} : null;
  if (_Component) {
    const root = ReactDOM.createRoot(document.getElementById('root'));
    root.render(React.createElement(_Component));
  } else {
    throw new Error('Component "${componentName}" not found. Make sure your component is exported with export default.');
  }

} catch (err) {
  document.getElementById('root').style.display = 'none';
  document.getElementById('error-display').style.display = 'block';
  document.getElementById('error-message').textContent = err.message || String(err);
  parent.postMessage({ type: 'error', message: err.message || String(err) }, '*');
}
<\/script>
<script>
// Catch runtime errors that happen after initial render
window.onerror = function(msg) {
  parent.postMessage({ type: 'error', message: String(msg) }, '*');
};
window.addEventListener('unhandledrejection', function(e) {
  parent.postMessage({ type: 'error', message: String(e.reason) }, '*');
});
<\/script>
</body>
</html>`
}

/* ── Component ──────────────────────────────────────────────── */

export function ReactRenderer({ content }: ReactRendererProps) {
  const [error, setError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [retryCount, setRetryCount] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const initialLoadDone = useRef(false)
  const restoring = useRef(false)
  const [loading, setLoading] = useState(true)

  const { srcdoc, unsupported } = useMemo(() => {
    setError(null)
    try {
      const { processedCode, componentName, unsupportedImports } = preprocessCode(content)
      if (unsupportedImports.length > 0) {
        setError(
          `Unsupported ${unsupportedImports.length === 1 ? "library" : "libraries"}: ${unsupportedImports.join(", ")}. ` +
          `Available: react, recharts, lucide-react, framer-motion.`
        )
      }
      return { srcdoc: buildSrcdoc(processedCode, componentName), unsupported: unsupportedImports }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process code")
      return { srcdoc: "", unsupported: [] }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, retryCount])

  // Reset load tracking when content changes
  useEffect(() => {
    initialLoadDone.current = false
    setLoading(true)
  }, [srcdoc])

  // Detect iframe navigation and restore srcDoc
  const handleIframeLoad = useCallback(() => {
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

  // Listen for error messages from the iframe
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "error" && typeof e.data.message === "string") {
        setError(e.data.message)
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [])

  const handleRetry = useCallback(() => {
    setError(null)
    setRetryCount((c) => c + 1)
  }, [])

  // Determine if this is a warning (unsupported libs but might still partially work)
  // vs a fatal error (no srcdoc at all)
  const isWarning = error && unsupported.length > 0 && srcdoc
  const isFatal = error && !srcdoc

  if (isFatal) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2.5">
            <div className="flex items-center gap-2 text-destructive min-w-0">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span className="text-sm font-medium">React render error</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleRetry}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => setShowSource((v) => !v)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
              >
                <Code className="h-3.5 w-3.5" />
                {showSource ? "Hide source" : "View source"}
              </button>
            </div>
          </div>
          <div className="px-3 py-2 border-t border-destructive/20 text-xs text-destructive/80">
            {error}
          </div>
          {showSource && (
            <pre className="px-3 py-3 border-t border-destructive/20 text-xs text-muted-foreground overflow-auto max-h-64 whitespace-pre-wrap font-mono bg-muted/30">
              {content}
            </pre>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full">
      {loading && !error && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Loading preview...</span>
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-x-0 top-0 z-20 p-3">
          <div className="rounded-lg border border-destructive/30 bg-background/95 backdrop-blur-sm shadow-lg overflow-hidden">
            <div className="flex items-center justify-between gap-2 px-3 py-2">
              <div className="flex items-center gap-2 text-destructive min-w-0">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span className="text-xs font-medium truncate">
                  {isWarning ? "Missing library" : "Render error"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleRetry}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium rounded bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                >
                  <RotateCcw className="h-3 w-3" />
                  Retry
                </button>
                <button
                  type="button"
                  onClick={() => setError(null)}
                  className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
            <div className="px-3 py-1.5 border-t border-destructive/20 text-[11px] text-destructive/80">
              {error}
            </div>
          </div>
        </div>
      )}
      <iframe
        ref={iframeRef}
        srcDoc={srcdoc}
        onLoad={handleIframeLoad}
        sandbox="allow-scripts"
        className="w-full h-full border-0 bg-white"
        style={{ minHeight: "100%" }}
        title="React Artifact Preview"
      />
    </div>
  )
}
