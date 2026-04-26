"use client"

import { useMemo, useRef, useState, useEffect, useCallback } from "react"
import { AlertTriangle, Wand2, Copy, Check, MonitorCog } from "@/lib/icons"

/* ── Sanitize AI-generated scene code ──────────────────────── */

/**
 * Robust JSX-tag stripper that handles BOTH self-closing (`<X />`) and
 * paired (`<X>...</X>`) forms, and that walks attribute strings character
 * by character so a `>` inside a string literal doesn't terminate early.
 *
 * The previous regex (`<X[\s\S]*?\/>`) only matched self-closing form, and
 * would chop tags early if any attribute contained a `>` character.
 */
function stripJsxTag(source: string, tagName: string, replacement = ""): string {
    let result = ""
    let i = 0
    while (i < source.length) {
        // Look for the next opening of `<tagName` followed by ` `, `/`, `>`,
        // or end. Has to be a tag boundary, not e.g. `<tagNameFoo`.
        const openIdx = findTagOpen(source, i, tagName)
        if (openIdx === -1) {
            result += source.slice(i)
            break
        }
        result += source.slice(i, openIdx)

        // Walk forward to find the end of the opening tag, respecting
        // single- and double-quoted attribute string literals.
        let j = openIdx + 1
        let inQuote: '"' | "'" | null = null
        let selfClosing = false
        while (j < source.length) {
            const ch = source[j]
            if (inQuote) {
                if (ch === inQuote) inQuote = null
                j++
                continue
            }
            if (ch === '"' || ch === "'") {
                inQuote = ch
                j++
                continue
            }
            if (ch === "/" && source[j + 1] === ">") {
                selfClosing = true
                j += 2
                break
            }
            if (ch === ">") {
                j++
                break
            }
            j++
        }

        if (selfClosing) {
            result += replacement
            i = j
            continue
        }

        // Paired form — find the matching `</tagName>` (no nesting since
        // these tags are not allowed to be nested inside themselves in our
        // valid scenes). Bail out gracefully if not found.
        const closeRe = new RegExp(`</\\s*${tagName}\\s*>`, "g")
        closeRe.lastIndex = j
        const closeMatch = closeRe.exec(source)
        if (!closeMatch) {
            // Unbalanced — skip just the opening tag
            result += replacement
            i = j
            continue
        }
        result += replacement
        i = closeMatch.index + closeMatch[0].length
    }
    return result
}

/** Find the next index where `<tagName` appears as a tag boundary. */
function findTagOpen(source: string, from: number, tagName: string): number {
    let i = from
    while (i < source.length) {
        const idx = source.indexOf(`<${tagName}`, i)
        if (idx === -1) return -1
        const after = source[idx + 1 + tagName.length]
        if (after === undefined || /[\s/>]/.test(after)) return idx
        i = idx + 1
    }
    return -1
}

function sanitizeSceneCode(code: string): string {
    let s = code

    // Remove 'use client' directive
    s = s.replace(/['"]use client['"]\s*;?\n?/g, "")

    // Remove ALL import statements — deps are provided via function params
    s = s.replace(/^import\s+[\s\S]*?from\s+['"].*?['"];?\s*$/gm, "")
    s = s.replace(/^import\s+['"].*?['"];?\s*$/gm, "")

    // Strip "export default" but keep the declaration
    s = s.replace(/export\s+default\s+/g, "")

    // Strip named exports
    s = s.replace(/export\s+(?=function|const|let|var|class)/g, "")

    // Replace <Canvas ...> with fragment (paired or self-closing)
    s = stripJsxTag(s, "Canvas", "<>")
    s = s.replace(/<\/\s*Canvas\s*>/g, "</>")

    // Remove components already provided by the App wrapper
    s = stripJsxTag(s, "OrbitControls")
    s = stripJsxTag(s, "Environment")
    // Keep <color attach="background">. The wrapper sets a default dark
    // background but if the LLM intentionally specifies a scene background
    // we should honor it. (Previously this was stripped, silently dropping
    // user-requested colors.)

    return s
}

/** Detect the scene component name from sanitized code */
function detectComponentName(code: string): string {
    const fnMatch = code.match(/function\s+([A-Z]\w*)\s*\(/)
    if (fnMatch) return fnMatch[1]

    const constMatch = code.match(/const\s+([A-Z]\w*)\s*=/)
    if (constMatch) return constMatch[1]

    return "Scene"
}

/* ── Dep names passed to new Function() ────────────────────── */

const DEP_NAMES = [
    "React", "useState", "useEffect", "useRef", "useMemo", "useCallback",
    "Suspense", "forwardRef", "memo", "createContext", "useContext", "Fragment",
    "THREE", "useFrame", "useThree",
    "useGLTF", "useAnimations", "Clone",
    "Float", "Sparkles", "MeshDistortMaterial", "MeshWobbleMaterial",
    "Text", "Sphere", "RoundedBox", "MeshTransmissionMaterial",
    "Stars", "Trail", "Center", "Billboard", "Grid", "Html", "Line", "GradientTexture",
]

/* ── Build iframe srcdoc ──────────────────────────────────── */

function buildSrcdoc(sceneCode: string): string {
    const sanitized = sanitizeSceneCode(sceneCode)
    const componentName = detectComponentName(sanitized)

    // Pass scene code as JSON to avoid any HTML escaping issues
    const sceneCodeJson = JSON.stringify(sanitized)

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { width:100vw; height:100vh; overflow:hidden; background:#0a0a0f; }
#root { width:100%; height:100%; }
#loading {
  position:fixed; inset:0; display:flex; align-items:center; justify-content:center;
  color:#888; font:14px/1 system-ui,sans-serif; background:#0a0a0f; z-index:50;
}
#loading.hidden { display:none; }
#error-overlay {
  display:none; position:fixed; inset:0; z-index:100;
  background:rgba(0,0,0,0.8); backdrop-filter:blur(4px);
  justify-content:center; align-items:center; padding:20px;
}
#error-overlay.visible { display:flex; }
#error-box {
  max-width:420px; background:#1c1c2e; border:1px solid rgba(239,68,68,0.4);
  border-radius:12px; padding:20px; color:#f87171;
  font:13px/1.6 ui-monospace,monospace; white-space:pre-wrap; word-break:break-word;
}
</style>

<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react/": "https://esm.sh/react@18.3.1/",
    "react-dom": "https://esm.sh/react-dom@18.3.1?external=react",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client?external=react",
    "three": "https://esm.sh/three@0.170.0",
    "three/": "https://esm.sh/three@0.170.0/",
    "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.17.10?external=react,react-dom,three",
    "@react-three/drei": "https://esm.sh/@react-three/drei@9.117.0?external=react,react-dom,three,@react-three/fiber"
  }
}
</script>

<!-- Babel standalone loaded sync — available before module script runs -->
<script src="https://unpkg.com/@babel/standalone@7.26.10/babel.min.js"></script>
</head>
<body>
<div id="loading">Loading 3D engine…</div>
<div id="root"></div>
<div id="error-overlay"><div id="error-box"></div></div>

<!-- Scene code as JSON (safe from HTML escaping issues) -->
<script id="scene-data" type="application/json">${sceneCodeJson}</script>

<!--
  Single module script: imports → WebGL check → Babel compile → mount.
  No timing races — everything runs sequentially in one block.
-->
<script type="module">
/* ── Error reporting ─────────────────────────── */
function showError(msg) {
  const m = String(msg);
  console.error('[R3F iframe]', m);
  document.getElementById('loading')?.classList.add('hidden');

  // Only match genuinely WebGL-specific errors (strict keywords)
  const isWebGL = m.includes('Error creating WebGL context')
    || m.includes('THREE.WebGLRenderer')
    || (m.toLowerCase().includes('webgl') && m.toLowerCase().includes('context'));

  // Always send the REAL error to parent — parent handles WebGL vs code errors
  const o = document.getElementById('error-overlay');
  const b = document.getElementById('error-box');
  if (o && b) { o.classList.add('visible'); b.textContent = m; }
  window.parent.postMessage({ type: 'r3f-error', message: m }, '*');
}
window.onerror = (msg) => showError(msg);
window.onunhandledrejection = (e) => showError(e.reason?.message || e.reason || 'Unhandled promise rejection');

try {
  /* ── 1. Import all deps ────────────────────── */
  const React = await import('react');
  const { useState, useEffect, useRef, useMemo, useCallback,
          Suspense, forwardRef, memo, createContext, useContext, Fragment } = React;
  const { createRoot } = await import('react-dom/client');
  const THREE = await import('three');
  const { Canvas, useFrame, useThree } = await import('@react-three/fiber');
  const {
    OrbitControls, Environment,
    useGLTF, useAnimations, Clone,
    Float, Sparkles, MeshDistortMaterial, MeshWobbleMaterial,
    Text, Sphere, RoundedBox, MeshTransmissionMaterial,
    Stars, Trail, Center, Billboard, Grid, Html, Line, GradientTexture
  } = await import('@react-three/drei');

  document.getElementById('loading')?.classList.add('hidden');

  /* ── 3. Read + compile AI scene code ───────── */
  const sceneSource = JSON.parse(document.getElementById('scene-data').textContent);

  const compiled = Babel.transform(sceneSource, {
    presets: ['react', ['typescript', { allExtensions: true, isTSX: true }]],
    filename: 'Scene.tsx',
  }).code;

  /* ── 4. Execute compiled scene code ────────── */
  const depNames = ${JSON.stringify(DEP_NAMES)};
  const depValues = [
    React, useState, useEffect, useRef, useMemo, useCallback,
    Suspense, forwardRef, memo, createContext, useContext, Fragment,
    THREE, useFrame, useThree,
    useGLTF, useAnimations, Clone,
    Float, Sparkles, MeshDistortMaterial, MeshWobbleMaterial,
    Text, Sphere, RoundedBox, MeshTransmissionMaterial,
    Stars, Trail, Center, Billboard, Grid, Html, Line, GradientTexture,
  ];

  const sceneFactory = new Function(
    ...depNames,
    compiled + '\\nreturn typeof ${componentName} !== "undefined" ? ${componentName} : null;'
  );
  const SceneComp = sceneFactory(...depValues) || function _Fallback() {
    return React.createElement('mesh', null,
      React.createElement('boxGeometry'),
      React.createElement('meshStandardMaterial', { color: 'hotpink' })
    );
  };

  /* ── 5. Error boundary to catch R3F render errors ──────── */
  class SceneErrorBoundary extends React.Component {
    constructor(props) {
      super(props);
      this.state = { error: null };
    }
    static getDerivedStateFromError(error) {
      return { error };
    }
    componentDidCatch(error, info) {
      showError(error.message || String(error));
    }
    render() {
      if (this.state.error) return null;
      return this.props.children;
    }
  }

  /* ── 6. App wrapper + mount (createElement, no JSX in module) */
  function App() {
    return React.createElement('div', { style: { width: '100vw', height: '100vh' } },
      React.createElement(Canvas, { camera: { position: [0, 2, 5], fov: 60 } },
        React.createElement('ambientLight', { intensity: 0.5 }),
        React.createElement('directionalLight', { position: [5, 5, 5], intensity: 1 }),
        React.createElement(Environment, { preset: 'city' }),
        React.createElement(Suspense, { fallback: null },
          React.createElement(SceneErrorBoundary, null,
            React.createElement(SceneComp)
          )
        ),
        React.createElement(OrbitControls, { makeDefault: true, dampingFactor: 0.05 })
      )
    );
  }

  createRoot(document.getElementById('root')).render(React.createElement(App));
  window.parent.postMessage({ type: 'r3f-ready' }, '*');

} catch (e) {
  showError(e.message || e);
}
</script>
</body>
</html>`
}

/* ── WebGL error detection ────────────────────────────────── */

function isWebGLError(msg: string): boolean {
    const m = msg.toLowerCase()
    return m.includes("error creating webgl context")
        || m.includes("three.webglrenderer")
        || (m.includes("webgl") && m.includes("context"))
}

interface BrowserInfo {
    name: string
    settingsUrl: string
    steps: string[]
}

function detectBrowser(): BrowserInfo {
    const ua = navigator.userAgent
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((navigator as any).brave?.isBrave) {
        return {
            name: "Brave",
            settingsUrl: "brave://settings/system",
            steps: [
                'Open brave://settings/system',
                'Enable "Use graphics acceleration when available"',
                "If already on, open brave://flags/#ignore-gpu-blocklist → set to Enabled",
                "Relaunch Brave",
            ],
        }
    }
    if (ua.includes("Edg/")) {
        return {
            name: "Edge",
            settingsUrl: "edge://settings/system",
            steps: [
                'Open edge://settings/system',
                'Enable "Use graphics acceleration when available"',
                "If already on, open edge://flags/#ignore-gpu-blocklist → set to Enabled",
                "Relaunch Edge",
            ],
        }
    }
    if (ua.includes("OPR/") || ua.includes("Opera")) {
        return {
            name: "Opera",
            settingsUrl: "opera://settings/system",
            steps: [
                'Open opera://settings/system',
                'Enable "Use graphics acceleration when available"',
                "If already on, open opera://flags/#ignore-gpu-blocklist → set to Enabled",
                "Relaunch Opera",
            ],
        }
    }
    if (ua.includes("Vivaldi")) {
        return {
            name: "Vivaldi",
            settingsUrl: "vivaldi://settings/system",
            steps: [
                'Open vivaldi://settings/system',
                'Enable "Use graphics acceleration when available"',
                "If already on, open vivaldi://flags/#ignore-gpu-blocklist → set to Enabled",
                "Relaunch Vivaldi",
            ],
        }
    }
    if (ua.includes("Firefox")) {
        return {
            name: "Firefox",
            settingsUrl: "about:preferences#general",
            steps: [
                "Open about:preferences#general",
                'Scroll to Performance, uncheck "Use recommended settings"',
                'Enable "Use hardware acceleration when available"',
                "If still failing, open about:config → search webgl.force-enabled → set to true",
                "Restart Firefox",
            ],
        }
    }
    if (ua.includes("Safari") && !ua.includes("Chrome")) {
        return {
            name: "Safari",
            settingsUrl: "",
            steps: [
                "Open Safari → Settings → Advanced",
                'Check "Show Develop menu"',
                "Go to Develop → Experimental Features",
                "Enable WebGL 2.0",
                "Restart Safari",
            ],
        }
    }
    // Default: Chrome / Chromium
    return {
        name: "Chrome",
        settingsUrl: "chrome://settings/system",
        steps: [
            'Open chrome://settings/system',
            'Enable "Use graphics acceleration when available"',
            "If already on, open chrome://flags/#ignore-gpu-blocklist → set to Enabled",
            "Relaunch Chrome",
        ],
    }
}

/* ── WebGL Help Overlay (React, parent-side) ─────────────── */

function WebGLHelpOverlay({ onDismiss }: { onDismiss: () => void }) {
    const [copied, setCopied] = useState(false)
    const browser = useMemo(() => detectBrowser(), [])

    const handleCopy = useCallback(() => {
        if (!browser.settingsUrl) return
        navigator.clipboard.writeText(browser.settingsUrl).then(() => {
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
        })
    }, [browser.settingsUrl])

    return (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="max-w-md mx-4 rounded-2xl border border-amber-500/30 bg-background/95 p-6 shadow-2xl">
                <div className="flex items-start gap-3 mb-4">
                    <div className="shrink-0 mt-0.5 h-9 w-9 rounded-lg bg-amber-500/10 flex items-center justify-center">
                        <MonitorCog className="h-5 w-5 text-amber-500" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground mb-1">
                            WebGL Not Available
                        </p>
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            3D rendering requires WebGL, which is currently disabled in{" "}
                            <span className="font-medium text-foreground">{browser.name}</span>.
                        </p>
                    </div>
                </div>

                <div className="rounded-lg border border-border bg-muted/50 p-4 mb-4">
                    <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2.5">
                        How to fix ({browser.name})
                    </p>
                    <ol className="space-y-1.5">
                        {browser.steps.map((step, i) => (
                            <li key={i} className="text-xs text-foreground/80 leading-relaxed flex gap-2">
                                <span className="shrink-0 text-muted-foreground font-medium">{i + 1}.</span>
                                <span>{step}</span>
                            </li>
                        ))}
                    </ol>
                </div>

                <div className="flex items-center gap-2">
                    {browser.settingsUrl && (
                        <button
                            type="button"
                            onClick={handleCopy}
                            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                        >
                            {copied ? (
                                <Check className="h-3.5 w-3.5" />
                            ) : (
                                <Copy className="h-3.5 w-3.5" />
                            )}
                            {copied ? "Copied!" : "Copy Settings URL"}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onDismiss}
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                    >
                        Dismiss
                    </button>
                </div>
            </div>
        </div>
    )
}

/* ── React component ──────────────────────────────────────── */

interface R3FRendererProps {
    content: string
    onFixWithAI?: (error: string) => void
}

export function R3FRenderer({ content, onFixWithAI }: R3FRendererProps) {
    const [error, setError] = useState<string | null>(null)
    const [webglError, setWebglError] = useState(false)
    const [ready, setReady] = useState(false)
    const iframeRef = useRef<HTMLIFrameElement>(null)
    // Persist didReady across content changes via a ref. Earlier code held
    // it as a `let` inside the message-handler effect closure — when content
    // changed rapidly, an `r3f-ready` event from the previous iframe could
    // land in the new closure where the local `didReady` was still false,
    // tripping a false-positive 20s timeout error.
    const didReadyRef = useRef(false)
    const srcdoc = useMemo(() => buildSrcdoc(content), [content])

    // Reset state when content changes
    useEffect(() => {
        setError(null)
        setWebglError(false)
        setReady(false)
        didReadyRef.current = false
    }, [content])

    // Listen for messages from the iframe + loading timeout
    useEffect(() => {
        const handler = (event: MessageEvent) => {
            // Only trust messages from THIS iframe's contentWindow. Without
            // this guard any other frame on the page (a different artifact,
            // a stray embed) could spoof `r3f-error` / `r3f-ready` events
            // and corrupt the renderer's state. Every other iframe-based
            // renderer in the codebase (react, slides) already does this
            // — R3F was the only outlier.
            if (event.source !== iframeRef.current?.contentWindow) return
            try {
                if (event.data?.type === "r3f-error") {
                    const msg = event.data.message
                    if (isWebGLError(msg)) {
                        setWebglError(true)
                    } else {
                        setError(msg)
                    }
                } else if (event.data?.type === "r3f-ready") {
                    didReadyRef.current = true
                    setReady(true)
                }
            } catch {
                /* ignore */
            }
        }
        window.addEventListener("message", handler)

        // If no ready signal after 20s, show a timeout hint
        const timeout = setTimeout(() => {
            if (!didReadyRef.current) {
                setError("Scene timed out loading. Check browser console (F12) for details. ESM imports may be blocked.")
            }
        }, 20000)

        return () => {
            window.removeEventListener("message", handler)
            clearTimeout(timeout)
        }
    }, [content])

    return (
        <div className="w-full h-full relative" style={{ minHeight: "500px" }}>
            <iframe
                ref={iframeRef}
                srcDoc={srcdoc}
                /* No sandbox — WebGL requires full GPU access which sandboxed iframes block in some browsers.
                   Content is safe since we generate the srcdoc ourselves from AI scene code. */
                className="w-full h-full border-0"
                style={{ minHeight: "500px" }}
                title="3D Scene"
            />

            {/* WebGL error — show browser-specific help (NOT "Fix with AI") */}
            {webglError && (
                <WebGLHelpOverlay onDismiss={() => setWebglError(false)} />
            )}

            {/* Code error — show error + Fix with AI */}
            {error && !webglError && (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                    <div className="max-w-md mx-4 rounded-xl border border-destructive/30 bg-background/95 p-6 shadow-2xl">
                        <div className="flex items-start gap-3 mb-4">
                            <AlertTriangle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                            <div className="min-w-0">
                                <p className="text-sm font-medium text-destructive mb-1">
                                    3D Scene Error
                                </p>
                                <p className="text-xs text-muted-foreground break-words font-mono leading-relaxed">
                                    {error.length > 300
                                        ? error.slice(0, 300) + "…"
                                        : error}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {onFixWithAI && (
                                <button
                                    type="button"
                                    onClick={() => onFixWithAI(error)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
                                >
                                    <Wand2 className="h-4 w-4" />
                                    Fix with AI
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={() => setError(null)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-muted hover:bg-muted/80 transition-colors"
                            >
                                Dismiss
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
