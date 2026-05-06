// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest"
import { render } from "@testing-library/react"

// Mock Streamdown so tests stay deterministic — we just render <pre> with the children.
vi.mock("streamdown", () => ({
  Streamdown: ({ children }: { children: string }) => (
    <pre data-testid="streamdown-mock">{children}</pre>
  ),
}))
vi.mock("streamdown/styles.css", () => ({}))

vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light" }),
}))

import { CodeSourceView } from "./code-source-view"

describe("CodeSourceView", () => {
  it("wraps content in a fence with the provided language", () => {
    const { getByTestId } = render(
      <CodeSourceView content={"export const x = 1\n"} language="typescript" wrap={false} searchQuery="" />,
    )
    const pre = getByTestId("streamdown-mock")
    expect(pre.textContent).toContain("```typescript")
    expect(pre.textContent).toContain("export const x = 1")
    expect(pre.textContent).toMatch(/```\s*$/)
  })

  it("uses an adaptive fence longer than any backtick run in the content", () => {
    const tricky = "```ts\nconst y = 2\n```"
    const { getByTestId } = render(
      <CodeSourceView content={tricky} language="typescript" wrap={false} searchQuery="" />,
    )
    const text = getByTestId("streamdown-mock").textContent ?? ""
    expect(text.includes("````typescript")).toBe(true)
  })

  it("applies wrap class when wrap is true", () => {
    const { container } = render(
      <CodeSourceView content="long line" language="typescript" wrap={true} searchQuery="" />,
    )
    const wrapper = container.querySelector("[data-code-source-wrap='true']")
    expect(wrapper).not.toBeNull()
  })

  it("renders an empty-state notice when content is empty", () => {
    const { getByText } = render(
      <CodeSourceView content="" language="typescript" wrap={false} searchQuery="" />,
    )
    expect(getByText(/no content/i)).not.toBeNull()
  })
})
