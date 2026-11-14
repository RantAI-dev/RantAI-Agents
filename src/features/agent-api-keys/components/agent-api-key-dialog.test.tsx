// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { AgentApiKeyDialog } from "./agent-api-key-dialog"

// Radix measures its triggers and popovers; jsdom has neither observer.
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal("ResizeObserver", NoopObserver)
  vi.stubGlobal("IntersectionObserver", NoopObserver)
})

afterEach(() => cleanup())

const assistants = [
  {
    id: "a1",
    name: "Budi Helper",
    emoji: "🤖",
  },
] as never[]

function renderDialog(blockers: string[] = []) {
  const onSubmit = vi.fn()
  render(
    <AgentApiKeyDialog
      open
      editing={null}
      assistants={assistants}
      readiness={{ loading: false, blockers }}
      assistantId="a1"
      onAssistantChange={() => {}}
      busy={false}
      error={null}
      onOpenChange={() => {}}
      onSubmit={onSubmit}
    />,
  )
  return onSubmit
}

describe("AgentApiKeyDialog", () => {
  it("creates a key with both scopes and every address allowed by default", () => {
    const onSubmit = renderDialog()
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Support widget" } })
    fireEvent.click(screen.getByRole("button", { name: /create key/i }))

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Support widget",
      assistantId: "a1",
      scopes: ["chat", "chat:stream"],
      ipWhitelist: [],
    })
  })

  it("warns that the API cannot serve an agent bound to the knowledge base", () => {
    renderDialog(["the knowledge base"])
    expect(screen.getByText(/409 capability_not_ported/)).not.toBeNull()
  })

  it("says nothing when the agent has no binding the gate refuses", () => {
    renderDialog([])
    expect(screen.queryByText(/capability_not_ported/)).toBeNull()
  })
})
