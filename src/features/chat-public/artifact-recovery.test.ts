// @vitest-environment node
import { describe, it, expect } from "vitest"
import { detectArtifactInText } from "./artifact-recovery"

const deck = JSON.stringify({
  theme: { primaryColor: "#0F172A", secondaryColor: "#3B82F6", fontFamily: "Inter, sans-serif" },
  slides: [{ layout: "title", title: "Forno Rosso", subtitle: "Pizza" }],
})

describe("detectArtifactInText — specific canvas mode", () => {
  it("recovers a fenced JSON deck when canvas mode is slides", () => {
    const text = `Berikut slide-nya:\n\n\`\`\`json\n${deck}\n\`\`\``
    const r = detectArtifactInText(text, { canvasMode: "application/slides" })
    expect(r).toEqual({ type: "application/slides", content: deck, language: undefined })
  })

  it("recovers bare JSON (no fence) when canvas mode is slides", () => {
    const r = detectArtifactInText(deck, { canvasMode: "application/slides" })
    expect(r?.type).toBe("application/slides")
    expect(r?.content).toBe(deck)
  })

  it("recovers a JSX fence for react canvas mode", () => {
    const code = "function App() {\n  return <div>hi</div>;\n}\nexport default App;"
    const r = detectArtifactInText(`\`\`\`jsx\n${code}\n\`\`\``, { canvasMode: "application/react" })
    expect(r).toEqual({ type: "application/react", content: code, language: undefined })
  })

  it("recovers a TSX fence for 3d canvas mode", () => {
    const code = "function Scene() {\n  return <mesh><boxGeometry /></mesh>;\n}\nexport default Scene;"
    const r = detectArtifactInText(`Scene:\n\`\`\`tsx\n${code}\n\`\`\``, { canvasMode: "application/3d" })
    expect(r?.type).toBe("application/3d")
    expect(r?.content).toBe(code)
  })

  it("returns null for prose with no code at all", () => {
    expect(detectArtifactInText("Maaf, bisa jelaskan lebih detail?", { canvasMode: "application/slides" })).toBeNull()
  })

  it("does not treat a tiny inline snippet as a slides deck", () => {
    expect(detectArtifactInText("Use `{}` for empty.", { canvasMode: "application/slides" })).toBeNull()
  })
})

describe("detectArtifactInText — auto / no canvas mode", () => {
  it("maps a JSON object with `slides` to application/slides", () => {
    const r = detectArtifactInText(`\`\`\`json\n${deck}\n\`\`\``, { canvasMode: "auto" })
    expect(r?.type).toBe("application/slides")
  })

  it("maps a JSON object with `cells` to application/python", () => {
    const nb = JSON.stringify({ cells: [{ type: "code", source: "print(1)" }] })
    const r = detectArtifactInText(`\`\`\`json\n${nb}\n\`\`\``, { canvasMode: true })
    expect(r?.type).toBe("application/python")
  })

  it("maps an html fence with a full document to text/html", () => {
    const html = "<!DOCTYPE html>\n<html>\n<head></head>\n<body>\n" + "<p>x</p>\n".repeat(20) + "</body>\n</html>"
    const r = detectArtifactInText(`\`\`\`html\n${html}\n\`\`\``, { canvasMode: "auto" })
    expect(r?.type).toBe("text/html")
  })

  it("maps an svg fence to image/svg+xml", () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>'
    const r = detectArtifactInText(`\`\`\`svg\n${svg}\n\`\`\``, { canvasMode: "auto" })
    expect(r?.type).toBe("image/svg+xml")
  })

  it("maps a mermaid fence to application/mermaid", () => {
    const r = detectArtifactInText("```mermaid\ngraph TD\nA-->B\n```", { canvasMode: "auto" })
    expect(r?.type).toBe("application/mermaid")
  })

  it("maps a jsx fence with export default to application/react, or 3d when it uses R3F", () => {
    const react = "function App() {\n  return <div/>;\n}\nexport default App;"
    expect(detectArtifactInText(`\`\`\`jsx\n${react}\n\`\`\``, { canvasMode: "auto" })?.type).toBe("application/react")
    const scene = "function Scene() {\n  useFrame(() => {});\n  return <mesh/>;\n}\nexport default Scene;"
    expect(detectArtifactInText(`\`\`\`jsx\n${scene}\n\`\`\``, { canvasMode: "auto" })?.type).toBe("application/3d")
  })

  it("promotes a long code fence to application/code with its language", () => {
    const py = Array.from({ length: 20 }, (_, i) => `x${i} = ${i}`).join("\n")
    const r = detectArtifactInText(`\`\`\`python\n${py}\n\`\`\``, { canvasMode: "auto" })
    expect(r).toEqual({ type: "application/code", content: py, language: "python" })
  })

  it("leaves a short code fence inline (not an artifact)", () => {
    expect(detectArtifactInText("```python\nprint(1)\n```", { canvasMode: "auto" })).toBeNull()
  })

  it("leaves everything alone when the tool was not available and no canvas mode", () => {
    expect(detectArtifactInText(`\`\`\`json\n${deck}\n\`\`\``, { canvasMode: null })).toBeNull()
  })

  it("still recovers when the tool was available even without canvas mode", () => {
    const r = detectArtifactInText(`\`\`\`json\n${deck}\n\`\`\``, { canvasMode: null, toolAvailable: true })
    expect(r?.type).toBe("application/slides")
  })
})
