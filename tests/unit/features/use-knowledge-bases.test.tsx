// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, waitFor, act } from "@testing-library/react"
import {
  useKnowledgeBases,
  dispatchKnowledgeBasesUpdated,
  KNOWLEDGE_BASES_UPDATED_EVENT,
} from "@/hooks/use-knowledge-bases"

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response
}

describe("useKnowledgeBases", () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("fetches on mount when no initial data is provided", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        groups: [{ id: "g1", name: "Guides", color: "#fff", documentCount: 5 }],
        totalDocumentCount: 5,
      }),
    )

    const { result } = renderHook(() => useKnowledgeBases())

    await waitFor(() => expect(result.current.totalDocumentCount).toBe(5))
    expect(result.current.knowledgeBases).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith("/api/dashboard/files/groups")
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("skips the on-mount fetch when initial data is provided", async () => {
    const { result } = renderHook(() =>
      useKnowledgeBases({
        groups: [{ id: "g1", name: "Guides", color: null, documentCount: 3 }],
        totalDocumentCount: 3,
      }),
    )

    expect(result.current.totalDocumentCount).toBe(3)
    expect(result.current.knowledgeBases[0]?.id).toBe("g1")
    // Settle micro-tasks and confirm no fetch fired.
    await Promise.resolve()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("re-fetches when knowledge-bases-updated event fires", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          groups: [{ id: "g1", name: "Guides", color: null, documentCount: 5 }],
          totalDocumentCount: 5,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          groups: [{ id: "g1", name: "Guides", color: null, documentCount: 4 }],
          totalDocumentCount: 4,
        }),
      )

    const { result } = renderHook(() => useKnowledgeBases())
    await waitFor(() => expect(result.current.totalDocumentCount).toBe(5))

    await act(async () => {
      dispatchKnowledgeBasesUpdated()
    })
    await waitFor(() => expect(result.current.totalDocumentCount).toBe(4))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("dispatchKnowledgeBasesUpdated fires the documented event name", () => {
    const listener = vi.fn()
    window.addEventListener(KNOWLEDGE_BASES_UPDATED_EVENT, listener)
    dispatchKnowledgeBasesUpdated()
    expect(listener).toHaveBeenCalledTimes(1)
    window.removeEventListener(KNOWLEDGE_BASES_UPDATED_EVENT, listener)
  })

  it("unsubscribes the listener on unmount", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ groups: [], totalDocumentCount: 0 }),
    )

    const { unmount } = renderHook(() => useKnowledgeBases())
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

    unmount()
    await act(async () => {
      dispatchKnowledgeBasesUpdated()
    })
    // No additional fetch after unmount — listener was removed cleanly.
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
