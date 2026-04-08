import { describe, it, expect } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

const VALID_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hello</title>
</head>
<body class="bg-slate-50">
  <h1>Hi</h1>
</body>
</html>`

const VALID_REACT = `function App() {
  const [n, setN] = useState(0);
  return (
    <div className="p-6">
      <button type="button" onClick={() => setN(n + 1)}>{n}</button>
    </div>
  );
}

export default App;`

describe("validateArtifactContent — text/html", () => {
  it("accepts a well-formed document", () => {
    const r = validateArtifactContent("text/html", VALID_HTML)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects missing doctype", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<!DOCTYPE html>", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/DOCTYPE/)
  })

  it("rejects missing viewport meta", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace(/<meta name="viewport"[^>]*\/>/, "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/viewport/)
  })

  it("rejects missing title", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<title>Hello</title>", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/title/i)
  })

  it("rejects empty title", () => {
    const r = validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<title>Hello</title>", "<title></title>")
    )
    expect(r.ok).toBe(false)
  })

  it("rejects <form action='...'>", () => {
    const html = VALID_HTML.replace(
      "<h1>Hi</h1>",
      '<form action="/submit"><input name="x" /></form>'
    )
    const r = validateArtifactContent("text/html", html)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/form/i)
  })

  it("warns on long inline <style> blocks", () => {
    const longStyle = Array.from({ length: 15 }, (_, i) => `.x${i} { color: red; }`).join("\n")
    const html = VALID_HTML.replace(
      "</head>",
      `<style>${longStyle}</style></head>`
    )
    const r = validateArtifactContent("text/html", html)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/style/i)
  })
})

describe("validateArtifactContent — application/react", () => {
  it("accepts a well-formed function component", () => {
    const r = validateArtifactContent("application/react", VALID_REACT)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a component using whitelisted imports", () => {
    const src = `import { useState } from 'react';
import { LineChart } from 'recharts';
import { Check } from 'lucide-react';
${VALID_REACT}`
    const r = validateArtifactContent("application/react", src)
    expect(r.ok).toBe(true)
  })

  it("rejects missing export default", () => {
    const r = validateArtifactContent(
      "application/react",
      VALID_REACT.replace("export default App;", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/export default/)
  })

  it("rejects non-whitelisted imports", () => {
    const src = `import create from 'zustand';\n${VALID_REACT}`
    const r = validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/zustand/)
  })

  it("rejects class components", () => {
    const src = `class App extends React.Component {
  render() { return <div />; }
}
export default App;`
    const r = validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/class/i)
  })

  it("rejects document.querySelector usage", () => {
    const src = `function App() {
  const el = document.querySelector('#x');
  return <div />;
}
export default App;`
    const r = validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/querySelector|getElementById/)
  })

  it("rejects CSS imports", () => {
    const src = `import './styles.css';\n${VALID_REACT}`
    const r = validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/CSS/i)
  })

  it("rejects JSX that fails to parse", () => {
    const r = validateArtifactContent(
      "application/react",
      "function App() { return <div<<<>; } export default App;"
    )
    expect(r.ok).toBe(false)
  })
})

describe("validateArtifactContent — image/svg+xml", () => {
  const v = (svg: string) => validateArtifactContent("image/svg+xml", svg)

  const VALID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="t">
  <title id="t">Bell</title>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`

  it("accepts a valid icon SVG", () => {
    const r = v(VALID_ICON)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("errors on missing xmlns", () => {
    const r = v(`<svg viewBox="0 0 24 24"><title>x</title></svg>`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/xmlns/)
  })

  it("errors on missing viewBox", () => {
    const r = v(`<svg xmlns="http://www.w3.org/2000/svg"><title>x</title></svg>`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/viewBox/)
  })

  it("errors on hardcoded width/height", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="200" height="200"><title>x</title></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/width\/height/)
  })

  it("errors on <script>", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><script>alert(1)</script></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/<script>/)
  })

  it("errors on <foreignObject>", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><foreignObject></foreignObject></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/foreignObject/)
  })

  it("errors on external href", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><image href="https://evil.com/x.png"/></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/external href/)
  })

  it("errors on event handler attributes", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><rect onclick="x()" width="10" height="10"/></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/event handler/)
  })

  it("errors on empty content", () => {
    const r = v("   ")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/)
  })

  it("warns on missing <title> when not aria-hidden", () => {
    const r = v(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10"/></svg>`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/<title>/)
  })

  it("does not warn when aria-hidden=\"true\"", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect width="10" height="10"/></svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it("warns on <style> blocks", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><style>.a{fill:red}</style><rect class="a"/></svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/<style>/)
  })

  it("warns on > 5 distinct colors", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title>` +
        `<rect fill="#111"/><rect fill="#222"/><rect fill="#333"/><rect fill="#444"/><rect fill="#555"/><rect fill="#666"/><rect fill="#777"/>` +
        `</svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/distinct colors/)
  })

  it("warns on high path precision", () => {
    const r = v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><path d="M12.456789 34.567890"/></svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/decimal places/)
  })

  it("accepts a valid illustration with title, desc, role, grouped", () => {
    const r = v(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-labelledby="t d">
  <title id="t">Empty</title>
  <desc id="d">Desc</desc>
  <g id="bg"><rect x="0" y="0" width="400" height="300" fill="#F1F5F9"/></g>
  <g id="doc"><rect x="140" y="70" width="120" height="150" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/></g>
  <g id="mag"><circle cx="220" cy="160" r="36" fill="none" stroke="#4F46E5" stroke-width="6"/></g>
</svg>`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })
})

describe("validateArtifactContent — application/mermaid", () => {
  const v = (src: string) => validateArtifactContent("application/mermaid", src)

  it("accepts a valid flowchart", () => {
    const r = v(`flowchart TD\n  A[Start] --> B[End]`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid sequence diagram", () => {
    const r = v(`sequenceDiagram\n  Alice->>Bob: Hello`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid ER diagram", () => {
    const r = v(`erDiagram\n  CUSTOMER ||--o{ ORDER : places`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid stateDiagram-v2", () => {
    const r = v(`stateDiagram-v2\n  [*] --> Draft\n  Draft --> [*]`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid gantt chart", () => {
    const r = v(
      `gantt\n  title Roadmap\n  dateFormat YYYY-MM-DD\n  section A\n  Task :a1, 2025-01-01, 5d`
    )
    expect(r.ok).toBe(true)
  })

  it("accepts a valid classDiagram", () => {
    const r = v(`classDiagram\n  class Animal\n  Animal <|-- Dog`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart preceded by leading frontmatter", () => {
    const r = v(`---\ntitle: My Chart\n---\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a flowchart preceded by a %% comment line", () => {
    const r = v(`%% leading comment\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart preceded by an init directive", () => {
    const r = v(`%%{init: {'theme':'default'}}%%\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("rejects empty content", () => {
    const r = v("   \n  \n")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects content wrapped in markdown fences", () => {
    const r = v("```mermaid\nflowchart TD\n  A --> B\n```")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/markdown code fences/i)
  })

  it("rejects content with no diagram declaration", () => {
    const r = v(`A[Start] --> B[End]`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("rejects content with an unknown diagram type", () => {
    const r = v(`uwuDiagram\n  A --> B`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("warns on very long content", () => {
    const padding = "  A --> B\n".repeat(400) // > 3000 chars
    const r = v(`flowchart TD\n${padding}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/chars/i)
  })

  it("warns on more than 15 flowchart node definitions", () => {
    const nodes = Array.from({ length: 18 }, (_, i) => `  N${i}[Node ${i}]`).join("\n")
    const r = v(`flowchart TD\n${nodes}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/15 nodes/i)
  })
})

describe("validateArtifactContent — other types pass through", () => {
  it("returns ok for text/markdown", () => {
    const r = validateArtifactContent("text/markdown", "# anything")
    expect(r.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// application/code
// ---------------------------------------------------------------------------

const TS_GOOD = `/** Add two numbers. */
export function add(a: number, b: number): number {
  return a + b
}

// Usage:
//   add(2, 3) // => 5
`

const PY_GOOD = `"""Greeting helper."""

def greet(name: str) -> str:
    """Return a greeting for the given name."""
    return f"Hello, {name}!"


if __name__ == "__main__":
    print(greet("Alice"))
`

const RS_GOOD = `//! Simple key-value store wrapper around HashMap.

use std::collections::HashMap;

pub struct Store {
    inner: HashMap<String, String>,
}

impl Store {
    pub fn new() -> Self {
        Self { inner: HashMap::new() }
    }

    pub fn set(&mut self, key: String, value: String) {
        self.inner.insert(key, value);
    }

    pub fn get(&self, key: &str) -> Option<&String> {
        self.inner.get(key)
    }

    pub fn delete(&mut self, key: &str) -> Option<String> {
        self.inner.remove(key)
    }
}
`

describe("validateArtifactContent — application/code", () => {
  it("accepts valid TypeScript", () => {
    const result = validateArtifactContent("application/code", TS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Python", () => {
    const result = validateArtifactContent("application/code", PY_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Rust", () => {
    const result = validateArtifactContent("application/code", RS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects empty content", () => {
    const result = validateArtifactContent("application/code", "   \n  \n")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/empty/i)
  })

  it("rejects HTML document (wrong type)", () => {
    const result = validateArtifactContent(
      "application/code",
      "<!DOCTYPE html>\n<html><body>hi</body></html>"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/text\/html/)
  })

  it("rejects markdown-fenced content", () => {
    const result = validateArtifactContent(
      "application/code",
      "```ts\nexport const x = 1\n```"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/markdown code fences/i)
  })

  it("warns on truncation marker '// ... rest of implementation'", () => {
    const content = `export function big() {
  doStep1()
  // ... rest of implementation
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on '// TODO: implement'", () => {
    const content = `export function foo() {
  // TODO: implement
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on Rust 'unimplemented!()'", () => {
    const content = `pub fn compute() -> i32 {
    unimplemented!()
}`
    const result = validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })
})
