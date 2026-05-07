// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

// Mock react-syntax-highlighter so tests stay deterministic — we just render
// a <pre data-language=... data-wrap-long-lines=...> with the children.
vi.mock("react-syntax-highlighter", () => ({
  Prism: ({
    children,
    language,
    wrapLongLines,
  }: {
    children: string
    language?: string
    wrapLongLines?: boolean
  }) => (
    <pre
      data-testid="syntax-highlighter-mock"
      data-language={language}
      data-wrap-long-lines={wrapLongLines ? "true" : "false"}
    >
      {children}
    </pre>
  ),
}))
vi.mock("react-syntax-highlighter/dist/esm/styles/prism", () => ({
  oneDark: {},
  oneLight: {},
}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

import { CodeSourceView } from "./code-source-view"

describe("CodeSourceView", () => {
  it("forwards content and the resolved language to the highlighter", () => {
    const { getByTestId } = render(
      <CodeSourceView
        content="export const x = 1\n"
        language="typescript"
        wrap={false}
      />,
    )
    const pre = getByTestId("syntax-highlighter-mock")
    expect(pre.getAttribute("data-language")).toBe("typescript")
    expect(pre.textContent).toContain("export const x = 1")
  })

  it("aliases LLM-style language names to Prism equivalents", () => {
    const { getByTestId } = render(
      <CodeSourceView content="echo hi" language="shell" wrap={false} />,
    )
    expect(
      getByTestId("syntax-highlighter-mock").getAttribute("data-language"),
    ).toBe("bash")
  })

  it("falls back to plain text when language is undefined", () => {
    const { getByTestId } = render(
      <CodeSourceView content="hello" language={undefined} wrap={false} />,
    )
    expect(
      getByTestId("syntax-highlighter-mock").getAttribute("data-language"),
    ).toBe("text")
  })

  it("forwards the wrap flag to the highlighter", () => {
    const { getByTestId } = render(
      <CodeSourceView content="long line" language="typescript" wrap={true} />,
    )
    expect(
      getByTestId("syntax-highlighter-mock").getAttribute(
        "data-wrap-long-lines",
      ),
    ).toBe("true")
  })

  it("sets the wrap data attribute on the outer container", () => {
    const { container } = render(
      <CodeSourceView content="long line" language="typescript" wrap={true} />,
    )
    expect(
      container.querySelector("[data-code-source-wrap='true']"),
    ).not.toBeNull()
  })

  it("renders an empty-state notice when content is empty", () => {
    const { getByText } = render(
      <CodeSourceView content="" language="typescript" wrap={false} />,
    )
    expect(getByText(/no content/i)).not.toBeNull()
  })
})
