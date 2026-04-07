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

describe("validateArtifactContent — other types pass through", () => {
  it("returns ok for text/markdown", () => {
    const r = validateArtifactContent("text/markdown", "# anything")
    expect(r.ok).toBe(true)
  })
})
