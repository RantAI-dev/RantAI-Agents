// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"
import AgentBuilderPageClient from "./agent-builder-page-client"

const mocks = vi.hoisted(() => ({ isAdmin: false }))

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => "/dashboard/agent-builder",
  useSearchParams: () => new URLSearchParams(),
}))

vi.mock("@/hooks/use-organization", () => ({
  useOrganization: () => ({
    activeOrganization: { id: "o1", name: "Acme", slug: "acme" },
    isAdmin: mocks.isAdmin,
    isOwner: false,
    canEdit: true,
  }),
}))

vi.mock("@/hooks/use-assistants", () => ({
  useAssistants: () => ({
    assistants: [],
    isLoading: false,
    addAssistant: vi.fn(),
    deleteAssistant: vi.fn(),
    refetch: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-default-assistant", () => ({
  useDefaultAssistant: () => ({
    assistant: null,
    source: "none",
    setUserDefault: vi.fn(),
    clearUserDefault: vi.fn(),
    refetch: vi.fn(),
  }),
}))

vi.mock("@/features/assistants/components/builder/agent-template-gallery", () => ({
  AgentTemplateGallery: () => <div data-testid="template-gallery" />,
}))

// The decorative reactbits pieces observe their own visibility; jsdom has no observer.
beforeAll(() => {
  class NoopObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return []
    }
  }
  vi.stubGlobal("IntersectionObserver", NoopObserver)
})

afterEach(() => cleanup())

describe("AgentBuilderPageClient", () => {
  it("hides every way to create an agent from a member", () => {
    mocks.isAdmin = false
    render(<AgentBuilderPageClient initialAssistants={[]} />)

    expect(screen.queryByRole("button", { name: /create agent/i })).toBeNull()
    expect(screen.queryByTestId("template-gallery")).toBeNull()
    expect(screen.getByText(/has not shared an agent with you yet/i)).not.toBeNull()
  })

  it("offers the create action to an admin", () => {
    mocks.isAdmin = true
    render(<AgentBuilderPageClient initialAssistants={[]} />)

    expect(screen.getAllByRole("button", { name: /create agent/i }).length).toBeGreaterThan(0)
    expect(screen.getByTestId("template-gallery")).not.toBeNull()
  })
})
