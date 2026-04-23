import { describe, it, expect, afterEach, vi } from "vitest"
import { validateArtifactContent } from "@/lib/tools/builtin/_validate-artifact"

vi.mock("@/lib/unsplash/client", () => ({
  searchPhoto: vi.fn(async (q: string) => ({
    urls: { regular: `https://images.unsplash.com/photo-${encodeURIComponent(q)}` },
    user: { name: "Photographer" },
  })),
}))

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

const VALID_REACT = `// @aesthetic: industrial
function App() {
  const [n, setN] = useState(0);
  return (
    <div className="p-6">
      <button type="button" onClick={() => setN(n + 1)}>{n}</button>
    </div>
  );
}

export default App;`

describe("validateArtifactContent — text/html", () => {
  it("accepts a well-formed document", async () => {
    const r = await validateArtifactContent("text/html", VALID_HTML)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects missing doctype", async () => {
    const r = await validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<!DOCTYPE html>", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/DOCTYPE/)
  })

  it("rejects missing viewport meta", async () => {
    const r = await validateArtifactContent(
      "text/html",
      VALID_HTML.replace(/<meta name="viewport"[^>]*\/>/, "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/viewport/)
  })

  it("rejects missing title", async () => {
    const r = await validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<title>Hello</title>", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/title/i)
  })

  it("rejects empty title", async () => {
    const r = await validateArtifactContent(
      "text/html",
      VALID_HTML.replace("<title>Hello</title>", "<title></title>")
    )
    expect(r.ok).toBe(false)
  })

  it("rejects <form action='...'>", async () => {
    const html = VALID_HTML.replace(
      "<h1>Hi</h1>",
      '<form action="/submit"><input name="x" /></form>'
    )
    const r = await validateArtifactContent("text/html", html)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/form/i)
  })

  it("warns on long inline <style> blocks", async () => {
    const longStyle = Array.from({ length: 15 }, (_, i) => `.x${i} { color: red; }`).join("\n")
    const html = VALID_HTML.replace(
      "</head>",
      `<style>${longStyle}</style></head>`
    )
    const r = await validateArtifactContent("text/html", html)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/style/i)
  })
})

describe("validateArtifactContent — application/react", () => {
  it("accepts a well-formed function component", async () => {
    const r = await validateArtifactContent("application/react", VALID_REACT)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a component using whitelisted imports", async () => {
    const src = `// @aesthetic: industrial
import { useState } from 'react';
import { LineChart } from 'recharts';
import { Check } from 'lucide-react';
${VALID_REACT}`
    const r = await validateArtifactContent("application/react", src)
    expect(r.ok).toBe(true)
  })

  it("rejects missing export default", async () => {
    const r = await validateArtifactContent(
      "application/react",
      VALID_REACT.replace("export default App;", "")
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/export default/)
  })

  it("rejects non-whitelisted imports", async () => {
    const src = `// @aesthetic: industrial\nimport create from 'zustand';\n${VALID_REACT}`
    const r = await validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/zustand/)
  })

  it("rejects class components", async () => {
    const src = `// @aesthetic: industrial
class App extends React.Component {
  render() { return <div />; }
}
export default App;`
    const r = await validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/class/i)
  })

  it("rejects document.querySelector usage", async () => {
    const src = `// @aesthetic: industrial
function App() {
  const el = document.querySelector('#x');
  return <div />;
}
export default App;`
    const r = await validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/querySelector|getElementById/)
  })

  it("rejects CSS imports", async () => {
    const src = `// @aesthetic: industrial\nimport './styles.css';\n${VALID_REACT}`
    const r = await validateArtifactContent("application/react", src)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/CSS/i)
  })

  it("rejects JSX that fails to parse", async () => {
    const r = await validateArtifactContent(
      "application/react",
      "// @aesthetic: industrial\nfunction App() { return <div<<<>; } export default App;"
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/failed to parse|parse/i)
  })
})

describe("validateArtifactContent — image/svg+xml", () => {
  const v = async (svg: string) => await validateArtifactContent("image/svg+xml", svg)

  const VALID_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" role="img" aria-labelledby="t">
  <title id="t">Bell</title>
  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`

  it("accepts a valid icon SVG", async () => {
    const r = await v(VALID_ICON)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
    expect(r.warnings).toEqual([])
  })

  it("errors on missing xmlns", async () => {
    const r = await v(`<svg viewBox="0 0 24 24"><title>x</title></svg>`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/xmlns/)
  })

  it("errors on missing viewBox", async () => {
    const r = await v(`<svg xmlns="http://www.w3.org/2000/svg"><title>x</title></svg>`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/viewBox/)
  })

  it("errors on hardcoded width/height", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="200" height="200"><title>x</title></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/width\/height/)
  })

  it("errors on <script>", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><script>alert(1)</script></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/<script>/)
  })

  it("errors on <foreignObject>", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><foreignObject></foreignObject></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/foreignObject/)
  })

  it("errors on external href", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><image href="https://evil.com/x.png"/></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/external href/)
  })

  it("errors on event handler attributes", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><rect onclick="x()" width="10" height="10"/></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/event handler/)
  })

  it("errors on empty content", async () => {
    const r = await v("   ")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/)
  })

  it("warns on missing <title> when not aria-hidden", async () => {
    const r = await v(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect width="10" height="10"/></svg>`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/<title>/)
  })

  it("does not warn when aria-hidden=\"true\"", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><rect width="10" height="10"/></svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it("rejects <style> blocks (CSS leaks into host page)", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><style>.a{fill:red}</style><rect class="a"/></svg>`
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/<style>/)
  })

  it("warns on > 5 distinct colors", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title>` +
        `<rect fill="#111"/><rect fill="#222"/><rect fill="#333"/><rect fill="#444"/><rect fill="#555"/><rect fill="#666"/><rect fill="#777"/>` +
        `</svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/distinct colors/)
  })

  it("warns on high path precision", async () => {
    const r = await v(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><title>x</title><path d="M12.456789 34.567890"/></svg>`
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/decimal places/)
  })

  it("accepts a valid illustration with title, desc, role, grouped", async () => {
    const r = await v(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" role="img" aria-labelledby="t d">
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
  const v = async (src: string) => await validateArtifactContent("application/mermaid", src)

  it("accepts a valid flowchart", async () => {
    const r = await v(`flowchart TD\n  A[Start] --> B[End]`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid sequence diagram", async () => {
    const r = await v(`sequenceDiagram\n  Alice->>Bob: Hello`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid ER diagram", async () => {
    const r = await v(`erDiagram\n  CUSTOMER ||--o{ ORDER : places`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid stateDiagram-v2", async () => {
    const r = await v(`stateDiagram-v2\n  [*] --> Draft\n  Draft --> [*]`)
    expect(r.ok).toBe(true)
  })

  it("accepts a valid gantt chart", async () => {
    const r = await v(
      `gantt\n  title Roadmap\n  dateFormat YYYY-MM-DD\n  section A\n  Task :a1, 2025-01-01, 5d`
    )
    expect(r.ok).toBe(true)
  })

  it("accepts a valid classDiagram", async () => {
    const r = await v(`classDiagram\n  class Animal\n  Animal <|-- Dog`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart preceded by leading frontmatter", async () => {
    const r = await v(`---\ntitle: My Chart\n---\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a flowchart preceded by a %% comment line", async () => {
    const r = await v(`%% leading comment\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("accepts a flowchart preceded by an init directive", async () => {
    const r = await v(`%%{init: {'theme':'default'}}%%\nflowchart TD\n  A --> B`)
    expect(r.ok).toBe(true)
  })

  it("rejects empty content", async () => {
    const r = await v("   \n  \n")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects content wrapped in markdown fences", async () => {
    const r = await v("```mermaid\nflowchart TD\n  A --> B\n```")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/markdown code fences/i)
  })

  it("rejects content with no diagram declaration", async () => {
    const r = await v(`A[Start] --> B[End]`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("rejects content with an unknown diagram type", async () => {
    const r = await v(`uwuDiagram\n  A --> B`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/diagram type declaration/i)
  })

  it("warns on very long content", async () => {
    const padding = "  A --> B\n".repeat(400) // > 3000 chars
    const r = await v(`flowchart TD\n${padding}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/chars/i)
  })

  it("warns on more than 15 flowchart node definitions", async () => {
    const nodes = Array.from({ length: 18 }, (_, i) => `  N${i}[Node ${i}]`).join("\n")
    const r = await v(`flowchart TD\n${nodes}`)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/15 nodes/i)
  })
})

describe("validateArtifactContent — application/python", () => {
  const v = async (code: string) => await validateArtifactContent("application/python", code)

  it("accepts a valid numpy + print script", async () => {
    const r = await v(`import numpy as np\n\nx = np.arange(10)\nprint("sum =", int(x.sum()))\n`)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a valid matplotlib script", async () => {
    const r = await v(
      `import numpy as np\nimport matplotlib.pyplot as plt\n\nplt.figure(figsize=(10, 6))\nplt.plot(np.arange(10))\nplt.title("demo")\nplt.xlabel("x")\nplt.ylabel("y")\nplt.tight_layout()\nplt.show()\n`
    )
    expect(r.ok).toBe(true)
  })

  it("accepts pandas (Pyodide auto-loads it)", async () => {
    const r = await v(`import pandas as pd\n\nprint(pd.Series([1, 2, 3]).mean())\n`)
    expect(r.ok).toBe(true)
  })

  it("rejects empty content", async () => {
    const r = await v("   \n  ")
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/empty/i)
  })

  it("rejects markdown fence wrap", async () => {
    const r = await v("```python\nprint('hi')\n```")
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/markdown code fences/i)
  })

  it("rejects `import requests`", async () => {
    const r = await v(`import requests\n\nprint(requests.get("https://x").text)\n`)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/requests/)
  })

  it("rejects `from flask import Flask`", async () => {
    const r = await v(`from flask import Flask\n\napp = Flask(__name__)\n`)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/flask/)
  })

  it("rejects `import torch`", async () => {
    const r = await v(`import torch\nprint(torch.tensor([1.0]))\n`)
    expect(r.ok).toBe(false)
    expect(r.errors[0]).toMatch(/torch/)
  })

  it("does NOT reject a substring match like `requestsx`", async () => {
    const r = await v(`requestsx = 1\nprint(requestsx)\n`)
    expect(r.ok).toBe(true)
  })

  it("ignores unavailable-package names that appear only inside comments", async () => {
    const r = await v(`# import requests  -- not used\nprint("ok")\n`)
    expect(r.ok).toBe(true)
  })

  it("rejects input()", async () => {
    const r = await v(`name = input("name? ")\nprint(name)\n`)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /input\(\)/.test(e))).toBe(true)
  })

  it("rejects open() with write mode", async () => {
    const r = await v(`with open("out.txt", "w") as f:\n    f.write("hi")\n`)
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => /open\(\)/.test(e))).toBe(true)
  })

  it("allows open() with read mode", async () => {
    const r = await v(`try:\n    open("x.txt", "r")\nexcept Exception as e:\n    print(e)\n`)
    expect(r.ok).toBe(true)
  })

  it("warns when there is no print() and no plt.show()", async () => {
    const r = await v(`x = 1 + 1\ny = x * 2\n`)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /no print\(\) or plt\.show\(\)/.test(w))).toBe(true)
  })

  it("warns on long time.sleep", async () => {
    const r = await v(`import time\ntime.sleep(30)\nprint("done")\n`)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /time\.sleep/.test(w))).toBe(true)
  })

  it("warns on `while True` with no break", async () => {
    const r = await v(`while True:\n    print("spin")\n`)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /while True/.test(w))).toBe(true)
  })

  it("does not warn on `while True` that has a break", async () => {
    const r = await v(`i = 0\nwhile True:\n    i += 1\n    if i > 5:\n        break\nprint(i)\n`)
    expect(r.ok).toBe(true)
    expect(r.warnings.some((w) => /while True/.test(w))).toBe(false)
  })
})

describe("validateArtifactContent — other types pass through", () => {
  it("returns ok for text/markdown", async () => {
    const r = await validateArtifactContent("text/markdown", "# anything")
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
  it("accepts valid TypeScript", async () => {
    const result = await validateArtifactContent("application/code", TS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Python", async () => {
    const result = await validateArtifactContent("application/code", PY_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("accepts valid Rust", async () => {
    const result = await validateArtifactContent("application/code", RS_GOOD)
    expect(result.ok).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it("rejects empty content", async () => {
    const result = await validateArtifactContent("application/code", "   \n  \n")
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/empty/i)
  })

  it("rejects HTML document (wrong type)", async () => {
    const result = await validateArtifactContent(
      "application/code",
      "<!DOCTYPE html>\n<html><body>hi</body></html>"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/text\/html/)
  })

  it("rejects markdown-fenced content", async () => {
    const result = await validateArtifactContent(
      "application/code",
      "```ts\nexport const x = 1\n```"
    )
    expect(result.ok).toBe(false)
    expect(result.errors[0]).toMatch(/markdown code fences/i)
  })

  it("warns on truncation marker '// ... rest of implementation'", async () => {
    const content = `export function big() {
  doStep1()
  // ... rest of implementation
}`
    const result = await validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on '// TODO: implement'", async () => {
    const content = `export function foo() {
  // TODO: implement
}`
    const result = await validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })

  it("warns on Rust 'unimplemented!()'", async () => {
    const content = `pub fn compute() -> i32 {
    unimplemented!()
}`
    const result = await validateArtifactContent("application/code", content)
    expect(result.ok).toBe(true)
    expect(result.warnings.join(" ")).toMatch(/truncation|placeholder/i)
  })
})

describe("validateArtifactContent — text/markdown", () => {
  it("accepts a well-structured document with a top-level heading", async () => {
    const md = `# Title\n\nSome paragraph.\n\n## Section\n\nMore content.\n`
    const r = await validateArtifactContent("text/markdown", md)
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it("errors on empty content", async () => {
    const r = await validateArtifactContent("text/markdown", "   \n  ")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("warns when the document has no top-level heading", async () => {
    const r = await validateArtifactContent("text/markdown", "Just a paragraph, no heading.")
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/top-level heading/i)
  })

  it("warns when heading levels skip", async () => {
    const md = `# Title\n\n### Skipped H2\n`
    const r = await validateArtifactContent("text/markdown", md)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/skip/i)
  })

  it("warns on a <script> tag", async () => {
    const md = `# Title\n\n<script>alert(1)</script>\n`
    const r = await validateArtifactContent("text/markdown", md)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/script/i)
  })
})

describe("validateArtifactContent — text/latex", () => {
  it("accepts a display-math document", async () => {
    const r = await validateArtifactContent("text/latex", "$$ x^2 + y^2 = z^2 $$")
    expect(r.ok).toBe(true)
    expect(r.warnings).toEqual([])
  })

  it("accepts an align environment", async () => {
    const tex = `\\section{Proof}\n\n\\begin{align}\na &= b \\\\\nc &= d\n\\end{align}\n`
    const r = await validateArtifactContent("text/latex", tex)
    expect(r.ok).toBe(true)
  })

  it("errors on empty content", async () => {
    const r = await validateArtifactContent("text/latex", "")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("errors on \\documentclass", async () => {
    const r = await validateArtifactContent("text/latex", "\\documentclass{article}\n$$x$$")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/documentclass/i)
  })

  it("errors on \\usepackage", async () => {
    const r = await validateArtifactContent("text/latex", "\\usepackage{amsmath}\n$$x$$")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/usepackage/i)
  })

  it("errors on \\begin{document}", async () => {
    const r = await validateArtifactContent(
      "text/latex",
      "\\begin{document}$$x$$\\end{document}"
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/begin\{document\}/i)
  })

  it("warns when there are no math delimiters", async () => {
    const r = await validateArtifactContent("text/latex", "\\section{Intro}\n\nHello world.")
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/math delimiter/i)
  })

  it("rejects fundamentally unsupported commands (\\includegraphics, figures, citations)", async () => {
    const tex = `\\section{Plot}\n\n$$ \\includegraphics{a.png} $$\n`
    const r = await validateArtifactContent("text/latex", tex)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/includegraphics/)
  })

  it("still warns (not errors) on softer unsupported commands like \\verb", async () => {
    const tex = `\\section{Notes}\n\n$x = 1$ — see \\verb|hello|.\n`
    const r = await validateArtifactContent("text/latex", tex)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/verb/)
  })
})

describe("validateArtifactContent — application/sheet (CSV)", () => {
  const VALID_CSV = `ID,Name,Department,Salary,Start Date
001,Amelia Hartwell,Engineering,182000,2019-03-12
002,Rohan Subramanian,Engineering,148000,2020-08-01
003,Maya Chen,Design,165000,2018-11-05`

  it("accepts a well-formed CSV", async () => {
    const r = await validateArtifactContent("application/sheet", VALID_CSV)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts a CSV with a quoted field containing a comma", async () => {
    const csv = `ID,Title\n1,"Engineer, Senior"\n2,"Engineer, Staff"`
    const r = await validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
  })

  it("rejects empty content", async () => {
    const r = await validateArtifactContent("application/sheet", "")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects whitespace-only content", async () => {
    const r = await validateArtifactContent("application/sheet", "   \n  \n")
    expect(r.ok).toBe(false)
  })

  it("rejects mismatched column count", async () => {
    const csv = `A,B,C\n1,2,3\n4,5`
    const r = await validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/column/i)
  })

  it("rejects header-only CSV", async () => {
    const r = await validateArtifactContent("application/sheet", "A,B,C")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/header/i)
  })

  it("warns on >100 rows", async () => {
    const lines = ["ID,Value"]
    for (let i = 0; i < 120; i++) lines.push(`${i},val${i}`)
    const r = await validateArtifactContent("application/sheet", lines.join("\n"))
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/pagination|100/)
  })

  it("warns on >10 columns", async () => {
    const cols = Array.from({ length: 12 }, (_, i) => `C${i}`)
    const csv = cols.join(",") + "\n" + cols.map((_, i) => i).join(",")
    const r = await validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/columns|10/)
  })

  it("warns on all-identical column", async () => {
    const csv = `ID,Status\n1,Active\n2,Active\n3,Active`
    const r = await validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/same value/i)
  })

  it("warns on currency symbols in numeric column", async () => {
    const csv = `Item,Price\nApple,$1.50\nPear,$2.25\nPlum,$3.00`
    const r = await validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/currency|thousand/i)
  })

  it("warns on mixed date formats", async () => {
    const csv = `ID,Start Date\n1,2026-01-15\n2,2026-02-20\n3,Jan 15, 2026\n4,Feb 20, 2026`
    // Note: the unquoted comma in "Jan 15, 2026" will trip column count.
    // Use a properly quoted version:
    const csvOk = `ID,Start Date\n1,2026-01-15\n2,2026-02-20\n3,"Jan 15, 2026"\n4,"Feb 20, 2026"`
    const r = await validateArtifactContent("application/sheet", csvOk)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/date/i)
  })
})

describe("validateArtifactContent — application/sheet (JSON)", () => {
  const VALID_JSON = `[
  {"Month": "2026-01", "Revenue": 482300, "Orders": 3120},
  {"Month": "2026-02", "Revenue": 511480, "Orders": 3284},
  {"Month": "2026-03", "Revenue": 498220, "Orders": 3198}
]`

  it("accepts a valid JSON array of objects", async () => {
    const r = await validateArtifactContent("application/sheet", VALID_JSON)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects invalid JSON", async () => {
    const r = await validateArtifactContent("application/sheet", "[{not valid}]")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/parse/i)
  })

  it("rejects top-level object", async () => {
    const r = await validateArtifactContent("application/sheet", `{"a": 1}`)
    // Top-level object doesn't start with "[" so falls through to CSV branch — that's fine,
    // but ensure it errors one way or another.
    expect(r.ok).toBe(false)
  })

  it("rejects empty array", async () => {
    const r = await validateArtifactContent("application/sheet", "[]")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects inconsistent key sets", async () => {
    const json = `[{"a":1,"b":2},{"a":3,"c":4}]`
    const r = await validateArtifactContent("application/sheet", json)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/key/i)
  })

  it("warns on nested object values", async () => {
    const json = `[{"id":1,"meta":{"x":1}},{"id":2,"meta":{"x":2}}]`
    const r = await validateArtifactContent("application/sheet", json)
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/nested|object/i)
  })
})

describe("validateArtifactContent — application/slides", () => {
  const v = async (c: string) => await validateArtifactContent("application/slides", c)

  const VALID_DECK = JSON.stringify({
    theme: { primaryColor: "#0F172A", secondaryColor: "#3B82F6", fontFamily: "Inter" },
    slides: [
      { layout: "title", title: "The Talk", subtitle: "By Someone" },
      { layout: "content", title: "Outline", bullets: ["A", "B", "C"] },
      { layout: "closing", title: "Thanks" },
    ],
  })

  it("accepts a well-formed deck", async () => {
    const r = await v(VALID_DECK)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects empty content", async () => {
    const r = await v("")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects markdown deck (legacy fallback discouraged)", async () => {
    const r = await v("# Slide 1\n\nHello world")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/JSON/)
  })

  it("rejects malformed JSON", async () => {
    const r = await v("{not json")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/parse/i)
  })

  it("rejects empty slides array", async () => {
    const r = await v(`{"theme":{},"slides":[]}`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/empty/i)
  })

  it("rejects an unknown layout", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [{ layout: "carousel", title: "X" }],
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/invalid layout/i)
  })

  it("rejects two-column missing left/right arrays", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X" },
          { layout: "two-column", title: "Compare" },
        ],
      }),
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/two-column/i)
  })

  it("warns when first slide is not title", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [{ layout: "content", title: "Outline", bullets: ["A"] }],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/first slide/i)
  })

  it("warns when bullets exceed the cap", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X", subtitle: "Y" },
          {
            layout: "content",
            title: "Many",
            bullets: ["1", "2", "3", "4", "5", "6", "7"],
          },
          { layout: "closing", title: "Bye" },
        ],
      }),
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/bullets/i)
  })

  it("warns when slide text contains markdown syntax", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "**Bold** Title", subtitle: "x" },
          { layout: "closing", title: "Bye" },
        ],
      }),
    )
    expect(r.warnings.join(" ")).toMatch(/markdown syntax/i)
  })

  it("warns when a bullet exceeds 10 words", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X", subtitle: "Y" },
          {
            layout: "content",
            title: "Long",
            bullets: [
              "this bullet has way too many words and should trigger the validator warning",
            ],
          },
          { layout: "closing", title: "Bye" },
        ],
      }),
    )
    expect(r.warnings.join(" ")).toMatch(/bullet 1 is \d+ words/)
  })

  it("warns on the deprecated image-text layout", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X", subtitle: "Y" },
          { layout: "image-text", title: "Visual", content: "..." },
          { layout: "closing", title: "Bye" },
        ],
      }),
    )
    expect(r.warnings.join(" ")).toMatch(/image-text/)
  })

  it("warns when the deck is shorter than the convention", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X", subtitle: "Y" },
          { layout: "closing", title: "Bye" },
        ],
      }),
    )
    expect(r.warnings.join(" ")).toMatch(/convention is 7/)
  })

  it("warns when the deck is longer than the convention", async () => {
    const slides = [{ layout: "title", title: "X", subtitle: "Y" }]
    for (let i = 0; i < 12; i++) {
      slides.push({ layout: "content", title: `S${i}`, bullets: ["a"] } as never)
    }
    slides.push({ layout: "closing", title: "Bye" } as never)
    const r = await v(JSON.stringify({ theme: {}, slides }))
    expect(r.warnings.join(" ")).toMatch(/convention is 7/)
  })

  it("warns when fewer than 3 distinct layouts are used in a long deck", async () => {
    // 8 slides using only 2 distinct layouts (title + content) should
    // trip the diversity warning. Closing intentionally omitted to keep
    // the layout count at exactly 2 for this assertion.
    const slides = [{ layout: "title", title: "X", subtitle: "Y" }]
    for (let i = 0; i < 7; i++) {
      slides.push({ layout: "content", title: `S${i}`, bullets: ["a"] } as never)
    }
    const r = await v(JSON.stringify({ theme: {}, slides }))
    expect(r.warnings.join(" ")).toMatch(/layout type/)
  })

  it("warns when the closing slide has no title", async () => {
    const r = await v(
      JSON.stringify({
        theme: {},
        slides: [
          { layout: "title", title: "X", subtitle: "Y" },
          { layout: "closing" },
        ],
      }),
    )
    expect(r.warnings.join(" ")).toMatch(/closing layout.*title/)
  })
})

describe("validateArtifactContent — application/3d", () => {
  const v = async (c: string) => await validateArtifactContent("application/3d", c)

  const VALID_SCENE = `function Scene() {
  const ref = useRef()
  useFrame((state, delta) => { if (ref.current) ref.current.rotation.y += delta })
  return (
    <>
      <mesh ref={ref}>
        <boxGeometry args={[1,1,1]} />
        <meshStandardMaterial color="hotpink" />
      </mesh>
    </>
  )
}

export default Scene`

  it("accepts a well-formed scene", async () => {
    const r = await v(VALID_SCENE)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("rejects empty content", async () => {
    const r = await v("")
    expect(r.ok).toBe(false)
  })

  it("rejects markdown fences", async () => {
    const r = await v("```jsx\n" + VALID_SCENE + "\n```")
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/code fences/i)
  })

  it("rejects <Canvas>", async () => {
    const r = await v(`function Scene() { return <Canvas><mesh/></Canvas> }\nexport default Scene`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/Canvas/)
  })

  it("rejects <OrbitControls>", async () => {
    const r = await v(
      `function Scene() { return <><OrbitControls /><mesh/></> }\nexport default Scene`,
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/OrbitControls/)
  })

  it("rejects document.* access", async () => {
    const r = await v(
      `function Scene() { document.getElementById('x'); return <></> }\nexport default Scene`,
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/document/i)
  })

  it("rejects requestAnimationFrame", async () => {
    const r = await v(
      `function Scene() { useEffect(() => { requestAnimationFrame(() => {}) }); return <></> }\nexport default Scene`,
    )
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/requestAnimationFrame/)
  })

  it("rejects missing export default", async () => {
    const r = await v(`function Scene() { return <></> }`)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/export default/)
  })

  it("warns on imports from non-whitelisted packages", async () => {
    const r = await v(
      `import { foo } from 'leva'\nfunction Scene() { return <></> }\nexport default Scene`,
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/leva/)
  })

  it("warns on non-whitelisted Drei symbols", async () => {
    const r = await v(
      `import { Bounds } from '@react-three/drei'\nfunction Scene() { return <></> }\nexport default Scene`,
    )
    expect(r.ok).toBe(true)
    expect(r.warnings.join(" ")).toMatch(/Bounds/)
  })
})

// ---------------------------------------------------------------------------
// create_artifact tool — early-return guard rails
// ---------------------------------------------------------------------------
//
// These tests cover the validation paths that fire BEFORE the tool reaches
// Prisma / S3 — so we don't need to mock storage. The persistence path is
// covered separately by integration tests.
describe("create_artifact tool — guard rails", () => {
  const VALID_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Hi</title>
</head>
<body><h1>Hi</h1></body>
</html>`

  it("rejects type mismatch when canvas mode is locked to a specific type", async () => {
    const { createArtifactTool } = await import(
      "@/lib/tools/builtin/create-artifact"
    )
    const result = (await createArtifactTool.execute(
      {
        title: "Test",
        type: "text/html",
        content: VALID_HTML,
      },
      { canvasMode: "application/react" },
    )) as { persisted: boolean; error?: string; validationErrors?: string[] }

    expect(result.persisted).toBe(false)
    expect(result.error).toMatch(/locked to "application\/react"/)
    expect(result.validationErrors?.[0]).toMatch(/expected "application\/react"/)
  })

  it("allows the matching type when canvas mode is locked", async () => {
    const { createArtifactTool } = await import(
      "@/lib/tools/builtin/create-artifact"
    )
    // We don't actually want this to reach persistence, so use a content
    // that fails downstream validation — that proves we got past the
    // canvas-mode check.
    const result = (await createArtifactTool.execute(
      {
        title: "Test",
        type: "text/html",
        content: "<not-html>",
      },
      { canvasMode: "text/html" },
    )) as { error?: string }
    // Should fail at HTML structural validation, not canvas-mode mismatch
    expect(result.error).not.toMatch(/locked to/)
  })

  it("allows any type when canvas mode is 'auto'", async () => {
    const { createArtifactTool } = await import(
      "@/lib/tools/builtin/create-artifact"
    )
    const result = (await createArtifactTool.execute(
      {
        title: "Test",
        type: "text/html",
        content: "<not-html>",
      },
      { canvasMode: "auto" },
    )) as { error?: string }
    expect(result.error).not.toMatch(/locked to/)
  })

  it("rejects application/code without a language parameter", async () => {
    const { createArtifactTool } = await import(
      "@/lib/tools/builtin/create-artifact"
    )
    const result = (await createArtifactTool.execute(
      {
        title: "Snippet",
        type: "application/code",
        content: "console.log('hi')",
      },
      {},
    )) as { persisted: boolean; error?: string; validationErrors?: string[] }

    expect(result.persisted).toBe(false)
    expect(result.error).toMatch(/require a `language` parameter/)
    expect(result.validationErrors?.[0]).toMatch(/Missing required `language`/)
  })

  it("accepts application/code when language is provided", async () => {
    const { createArtifactTool } = await import(
      "@/lib/tools/builtin/create-artifact"
    )
    // Will likely fail downstream at persistence (no DB) but must pass the
    // language check. We assert language is NOT mentioned in the error path.
    const result = (await createArtifactTool.execute(
      {
        title: "Snippet",
        type: "application/code",
        content: "console.log('hi')",
        language: "typescript",
      },
      {},
    )) as { error?: string }
    if (result.error !== undefined) {
      expect(result.error).not.toMatch(/`language` parameter/)
    }
  })
})

// ---------------------------------------------------------------------------
// Drift guard: Python prompt vs validator blacklist
// ---------------------------------------------------------------------------
//
// The Python artifact prompt advertises a list of packages that are
// auto-loaded by Pyodide. The validator carries a separate blacklist of
// packages it knows are NOT in Pyodide. These two lists must never overlap —
// if a package appears in both, the LLM is told it can `import` something
// that the validator will simultaneously reject as unavailable.
//
// This test parses the prompt and asserts no overlap, so future edits to
// either list cause the test to fail loudly instead of silently lying to
// the model.
describe("python prompt ↔ validator blacklist", () => {
  it("auto-loaded packages claimed by the prompt are not in the validator blacklist", async () => {
    const { pythonArtifact } = await import("@/lib/prompts/artifacts/python")

    // Documented auto-load list (sourced from python.ts:13).
    const documentedAutoLoad = [
      "numpy",
      "matplotlib",
      "pandas",
      "scipy",
      "sympy",
      "networkx",
      "sklearn",
      "PIL",
      "pytz",
      "dateutil",
      "regex",
      "bs4",
      "lxml",
      "yaml",
    ]

    // Sanity check the prompt actually mentions each one.
    for (const pkg of documentedAutoLoad) {
      expect(
        pythonArtifact.rules.includes(pkg),
        `python.ts rules section is missing documented package "${pkg}"`,
      ).toBe(true)
    }

    // Round-trip every documented package through the validator with a
    // synthetic `import` statement and confirm it does NOT trigger the
    // unavailable-packages error.
    for (const pkg of documentedAutoLoad) {
      const r = await validateArtifactContent(
        "application/python",
        `import ${pkg}\nprint(${pkg})\n`,
      )
      expect(
        r.errors.find((e) => /unavailable packages/i.test(e)),
        `validator falsely rejects documented package "${pkg}"`,
      ).toBeUndefined()
    }
  })
})

// ---------------------------------------------------------------------------
// ARTIFACT_REGISTRY — single source of truth for artifact type metadata
// ---------------------------------------------------------------------------

describe("ARTIFACT_REGISTRY", () => {
  it("every entry has all required fields populated", async () => {
    const { ARTIFACT_REGISTRY } = await import(
      "@/features/conversations/components/chat/artifacts/registry"
    )
    expect(ARTIFACT_REGISTRY.length).toBeGreaterThan(0)
    for (const entry of ARTIFACT_REGISTRY) {
      expect(typeof entry.type).toBe("string")
      expect(entry.type).toMatch(/.+\/.+/) // MIME-style
      expect(typeof entry.label).toBe("string")
      expect(entry.label.length).toBeGreaterThan(0)
      expect(typeof entry.shortLabel).toBe("string")
      expect(entry.shortLabel.length).toBeGreaterThan(0)
      expect(entry.icon).toBeTruthy()
      expect(typeof entry.colorClasses).toBe("string")
      expect(entry.colorClasses).toMatch(/text-/)
      expect(typeof entry.extension).toBe("string")
      expect(entry.extension.startsWith(".")).toBe(true)
      expect(typeof entry.codeLanguage).toBe("string") // may be empty
      expect(typeof entry.hasCodeTab).toBe("boolean")
    }
  })

  it("ARTIFACT_TYPES list mirrors the registry entries", async () => {
    const { ARTIFACT_REGISTRY, ARTIFACT_TYPES } = await import(
      "@/features/conversations/components/chat/artifacts/registry"
    )
    expect(ARTIFACT_TYPES.length).toBe(ARTIFACT_REGISTRY.length)
    for (const entry of ARTIFACT_REGISTRY) {
      expect(ARTIFACT_TYPES).toContain(entry.type)
    }
  })

  it("derived TYPE_ICONS / TYPE_LABELS / TYPE_SHORT_LABELS / TYPE_COLORS are exhaustive", async () => {
    const { ARTIFACT_REGISTRY, TYPE_ICONS, TYPE_LABELS, TYPE_SHORT_LABELS, TYPE_COLORS } =
      await import("@/features/conversations/components/chat/artifacts/registry")
    for (const entry of ARTIFACT_REGISTRY) {
      expect(TYPE_ICONS[entry.type]).toBeTruthy()
      expect(TYPE_LABELS[entry.type]).toBe(entry.label)
      expect(TYPE_SHORT_LABELS[entry.type]).toBe(entry.shortLabel)
      expect(TYPE_COLORS[entry.type]).toBe(entry.colorClasses)
    }
  })

  it("getArtifactRegistryEntry returns the exact entry for a known type", async () => {
    const { getArtifactRegistryEntry } = await import(
      "@/features/conversations/components/chat/artifacts/registry"
    )
    const doc = getArtifactRegistryEntry("text/document")
    expect(doc).toBeDefined()
    expect(doc?.label).toBe("Document")
    expect(doc?.extension).toBe(".docx")
    expect(doc?.hasCodeTab).toBe(false)
  })

  it("getArtifactRegistryEntry returns undefined for an unknown type", async () => {
    const { getArtifactRegistryEntry } = await import(
      "@/features/conversations/components/chat/artifacts/registry"
    )
    expect(getArtifactRegistryEntry("application/totally-fake")).toBeUndefined()
  })

  it("VALID_ARTIFACT_TYPES Set matches the registry", async () => {
    const { ARTIFACT_REGISTRY, VALID_ARTIFACT_TYPES } = await import(
      "@/features/conversations/components/chat/artifacts/registry"
    )
    expect(VALID_ARTIFACT_TYPES.size).toBe(ARTIFACT_REGISTRY.length)
    for (const entry of ARTIFACT_REGISTRY) {
      expect(VALID_ARTIFACT_TYPES.has(entry.type)).toBe(true)
    }
  })
})

describe("validateArtifactContent — application/sheet (JSON spec)", () => {
  const VALID_SPEC = JSON.stringify({
    kind: "spreadsheet/v1",
    sheets: [
      {
        name: "Sheet1",
        cells: [
          { ref: "A1", value: "Header" },
          { ref: "B1", value: 42 },
          { ref: "B2", formula: "=B1*2" },
        ],
      },
    ],
  })

  it("accepts a valid spec", () => {
    const r = validateArtifactContent("application/sheet", VALID_SPEC)
    expect(r.ok).toBe(true)
  })

  it("rejects a spec with an undefined cell reference", () => {
    const bad = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [{ ref: "A1", formula: "=Z99*2" }],
        },
      ],
    })
    const r = validateArtifactContent("application/sheet", bad)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/Z99|undefined|REF/i)
  })

  it("rejects a spec with a circular reference", () => {
    const bad = JSON.stringify({
      kind: "spreadsheet/v1",
      sheets: [
        {
          name: "Sheet1",
          cells: [
            { ref: "A1", formula: "=B1+1" },
            { ref: "B1", formula: "=A1+1" },
          ],
        },
      ],
    })
    const r = validateArtifactContent("application/sheet", bad)
    expect(r.ok).toBe(false)
    expect(r.errors.join(" ")).toMatch(/circular|cycle/i)
  })

  it("still accepts legacy CSV content unchanged", () => {
    const csv = "A,B\n1,2\n3,4"
    const r = validateArtifactContent("application/sheet", csv)
    expect(r.ok).toBe(true)
  })
})

describe("validateArtifactContent — application/react — aesthetic directive", () => {
  const MINIMAL_BODY = `function App() {
  return <div>hi</div>
}
export default App`

  it("accepts a valid @aesthetic directive", async () => {
    const code = `// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.errors).toEqual([])
  })

  it("accepts all 7 valid direction names", async () => {
    for (const dir of ["editorial", "brutalist", "luxury", "playful", "industrial", "organic", "retro-futuristic"]) {
      const code = `// @aesthetic: ${dir}\n${MINIMAL_BODY}`
      const r = await validateArtifactContent("application/react", code)
      expect(r.ok, `direction ${dir} should validate`).toBe(true)
    }
  })

  it("hard-errors when @aesthetic directive is missing", async () => {
    const r = await validateArtifactContent("application/react", MINIMAL_BODY)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toContain("@aesthetic")
    expect(r.errors.join("\n")).toContain("line 1")
  })

  it("hard-errors when @aesthetic value is unknown", async () => {
    const code = `// @aesthetic: synthwave\n${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/unknown aesthetic/i)
  })

  it("hard-errors when @aesthetic is not on line 1", async () => {
    const code = `// intro\n// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toContain("@aesthetic")
  })
})

describe("validateArtifactContent — application/react — fonts directive", () => {
  const MINIMAL_BODY = `function App() { return <div/> }\nexport default App`

  it("accepts well-formed @fonts directive", async () => {
    const code = `// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900 | Inter:wght@400;500;700
${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
  })

  it("hard-errors on malformed @fonts spec", async () => {
    const code = `// @aesthetic: editorial
// @fonts: lowercase:wght@400
${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/malformed.*@fonts/i)
  })

  it("hard-errors when more than 3 families declared", async () => {
    const code = `// @aesthetic: editorial
// @fonts: Inter:wght@400 | Lora:wght@400 | Roboto:wght@400 | Poppins:wght@400
${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(false)
    expect(r.errors.join("\n")).toMatch(/too many font families/i)
  })

  it("accepts artifacts with @aesthetic but no @fonts directive", async () => {
    const code = `// @aesthetic: editorial\n${MINIMAL_BODY}`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
  })
})

describe("validateArtifactContent — application/react — palette soft-warn", () => {
  it("warns when editorial + heavy slate/indigo usage", async () => {
    const code = `// @aesthetic: editorial
function App() {
  return (
    <div className="bg-slate-50 text-slate-900">
      <div className="text-slate-700 bg-indigo-600 border-slate-200 text-indigo-500 bg-slate-100">hi</div>
    </div>
  )
}
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/palette.*industrial/i)
  })

  it("does NOT warn when industrial + slate usage", async () => {
    const code = `// @aesthetic: industrial
function App() {
  return (
    <div className="bg-slate-50 text-slate-900 border-slate-200 bg-slate-100 text-slate-700 text-indigo-500">hi</div>
  )
}
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).not.toMatch(/palette/i)
  })

  it("does NOT warn on sparse slate usage (< 6 matches)", async () => {
    const code = `// @aesthetic: editorial
function App() {
  return <div className="bg-slate-50 text-slate-900 border-slate-200">hi</div>
}
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/palette/i)
  })
})

describe("validateArtifactContent — application/react — font soft-warn", () => {
  it("warns when editorial direction has no serif in @fonts", async () => {
    const code = `// @aesthetic: editorial
// @fonts: Inter:wght@400;500;700 | Space Mono:wght@400;700
function App() { return <div/> }
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/serif/i)
  })

  it("does NOT warn when editorial + Fraunces declared", async () => {
    const code = `// @aesthetic: editorial
// @fonts: Fraunces:wght@300..900 | Inter:wght@400;500;700
function App() { return <div/> }
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/serif/i)
  })

  it("does NOT warn when editorial uses default fonts (no @fonts directive)", async () => {
    const code = `// @aesthetic: editorial
function App() { return <div/> }
export default App`
    const r = await validateArtifactContent("application/react", code)
    // Defaults for editorial include Fraunces → no warn
    expect(r.warnings.join("\n")).not.toMatch(/serif/i)
  })
})

describe("validateArtifactContent — application/react — motion-in-industrial soft-warn", () => {
  it("warns when industrial uses Motion.motion", async () => {
    const code = `// @aesthetic: industrial
function App() {
  return <Motion.motion.div animate={{ x: 100 }}>hi</Motion.motion.div>
}
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/motion/i)
  })

  it("does NOT warn when playful uses Motion.motion", async () => {
    const code = `// @aesthetic: playful
function App() {
  return <Motion.motion.div animate={{ x: 100 }}>hi</Motion.motion.div>
}
export default App`
    const r = await validateArtifactContent("application/react", code)
    expect(r.warnings.join("\n")).not.toMatch(/motion/i)
  })
})

describe("validateArtifactContent — application/react — rollback flag", () => {
  const BODY_WITHOUT_DIRECTIVE = `function App() { return <div/> }\nexport default App`
  const orig = process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED

  afterEach(() => {
    if (orig === undefined) delete process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED
    else process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = orig
  })

  it("hard-errors on missing directive by default (flag unset)", async () => {
    delete process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED
    const r = await validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(false)
  })

  it("hard-errors on missing directive when flag='true' (explicit)", async () => {
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = "true"
    const r = await validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(false)
  })

  it("passes when flag='false' even without directive", async () => {
    process.env.ARTIFACT_REACT_AESTHETIC_REQUIRED = "false"
    const r = await validateArtifactContent("application/react", BODY_WITHOUT_DIRECTIVE)
    expect(r.ok).toBe(true)
    expect(r.warnings.join("\n")).toMatch(/@aesthetic.*missing/i)
  })
})

// ---------------------------------------------------------------------------
// NEW — text/document AST pipeline tests
// ---------------------------------------------------------------------------

import { proposalExample } from "@/lib/document-ast/examples/proposal"

describe("validateArtifactContent — text/document (AST)", () => {
  it("accepts a valid DocumentAst JSON", async () => {
    const result = await validateArtifactContent("text/document", JSON.stringify(proposalExample))
    expect(result.ok).toBe(true)
  })

  it("rejects non-JSON content", async () => {
    const result = await validateArtifactContent("text/document", "# A markdown doc\n\nBody.")
    expect(result.ok).toBe(false)
  })

  it("rejects invalid AST shape (empty body)", async () => {
    const result = await validateArtifactContent(
      "text/document",
      JSON.stringify({ meta: { title: "T" }, body: [] })
    )
    expect(result.ok).toBe(false)
  })
})
