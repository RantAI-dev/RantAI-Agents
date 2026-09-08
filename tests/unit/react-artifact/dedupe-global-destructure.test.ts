import { describe, expect, it } from "vitest"
import { dedupeGlobalDestructure } from "@/features/conversations/components/chat/artifacts/renderers/_dedupe-global-destructure"
import { preprocessCode } from "@/features/conversations/components/chat/artifacts/renderers/react-renderer"

const provided = new Set(["useState", "useMemo", "useEffect"])

describe("dedupeGlobalDestructure", () => {
  it("removes a destructure whose names are all already provided", () => {
    const out = dedupeGlobalDestructure("const { useState, useMemo } = React;\nfunction App(){}", "React", provided)
    expect(out).not.toMatch(/const \{/)
    expect(out).toContain("function App(){}")
  })

  it("keeps only the names the sandbox does not provide", () => {
    const out = dedupeGlobalDestructure("const { useState, Profiler } = window.React", "React", provided)
    expect(out).toBe("const { Profiler } = React;")
  })

  it("keeps aliased bindings", () => {
    const out = dedupeGlobalDestructure("let { useState: useS } = React;", "React", provided)
    expect(out).toBe("const { useState: useS } = React;")
  })

  it("leaves unrelated destructures alone", () => {
    const src = "const { a, b } = props;"
    expect(dedupeGlobalDestructure(src, "React", provided)).toBe(src)
  })
})

describe("preprocessCode — the tip-calculator failure", () => {
  it("does not emit a duplicate useState declaration", () => {
    const { processedCode } = preprocessCode(
      "// @aesthetic: editorial\nconst { useState, useMemo } = React;\nfunction App() {\n  const [bill, setBill] = useState('');\n  return <div>{bill}</div>;\n}\nexport default App;",
    )
    expect(processedCode).not.toMatch(/const \{ useState/)
    // Simulate the prelude + body: must parse as one script.
    const prelude = "const { useState, useMemo } = { useState() {}, useMemo() {} };"
    const body = processedCode.replace(/<div>\{bill\}<\/div>/, "null")
    expect(() => new Function(`${prelude}\n${body}`)).not.toThrow()
  })
})

describe("buildSrcdoc — sandbox CDN pins", () => {
  it("pins Babel standalone to a 7.x build (Babel 8 injects ESM imports)", async () => {
    const { buildSrcdoc, preprocessCode } = await import(
      "@/features/conversations/components/chat/artifacts/renderers/react-renderer"
    )
    const { processedCode, componentName, directives } = preprocessCode("function App(){return null}\nexport default App;")
    const html = buildSrcdoc(processedCode, componentName, directives)
    expect(html).toMatch(/@babel\/standalone@7\.\d+\.\d+\/babel\.min\.js/)
  })
})
