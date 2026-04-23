// Vitest setup file: stub @/lib/icons globally.
//
// The real module re-exports React components from `@lineiconshq/react-lineicons`,
// whose package.json declares `"main": "dist/index.js"` even though the actual
// built artifact lives at `dist/index.cjs.js`. That mismatch breaks Vite's
// module resolver, and any test that transitively imports the icons module
// (registry.ts, create-artifact.ts, anything depending on the artifact pipeline)
// fails to load.
//
// Tests don't render icon components — they only need the named exports to be
// truthy. We list every icon the artifact pipeline reads (currently 12 from
// registry.ts plus a handful of others used by adjacent modules) and hand back
// a stub object for each. If a future module adds an icon import that this
// stub misses, vitest will surface a clear "No 'X' export defined" error and
// the fix is to add the name to the list below.

import { vi } from "vitest"

const ICON_NAMES = [
  // registry.ts (Phase 7)
  "Globe", "FileCode", "Image", "GitBranch", "FileText", "BookOpen",
  "Code", "Table2", "Sigma", "Presentation", "Terminal", "Box",
  // adjacent modules that may be pulled in transitively
  "Loader2", "AlertTriangle", "RotateCcw", "ChevronRight", "ChevronLeft",
  "ChevronDown", "ChevronUp", "X", "Check", "CheckCircle", "Plus",
  "Trash2", "Pencil", "PenTool", "Settings", "Bell", "Search",
  "Folder", "Database", "MessageSquare", "Blocks", "Headphones",
  "Store", "Building2", "User", "Star", "Eye", "ArrowRight",
  "FilePenLine", "AngleDoubleRight",
] as const

const stubModule: Record<string, unknown> = {}
for (const name of ICON_NAMES) {
  // Use a named function so React can render it as a component AND
  // non-rendering tests can still treat it as a truthy object.
  const fn = () => null
  ;(fn as any).displayName = name
  stubModule[name] = fn
}
stubModule.default = stubModule

vi.mock("@/lib/icons", () => stubModule)
