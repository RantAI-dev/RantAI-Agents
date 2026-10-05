import { describe, it, expect } from "vitest"
import { mapDocument, type DashboardDocument } from "@/features/knowledge/documents/service-shared"
import type { KnowledgeDocumentListItem } from "@/features/knowledge/documents/service-shared"

function baseItem(overrides: Partial<KnowledgeDocumentListItem> = {}): KnowledgeDocumentListItem {
  return {
    id: "doc_1",
    title: "Quarterly report",
    categories: ["FINANCE"],
    subcategory: null,
    fileType: "pdf",
    artifactType: null,
    fileSize: 1024,
    hasS3File: true,
    thumbnailUrl: undefined,
    chunkCount: 12,
    groups: [{ id: "g1", name: "Reports", color: "#000" }],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    status: "ready",
    ingest: null,
    ...overrides,
  }
}

describe("mapDocument (TC-1555)", () => {
  it("passes through status: 'failed' verbatim", () => {
    const item = baseItem({ status: "failed" })
    const mapped = mapDocument(item)
    expect(mapped.status).toBe("failed")
  })

  it("passes through a full ingest snapshot", () => {
    const ingest = {
      jobId: "job_99",
      step: "embedding",
      progress: 42,
      stepCurrent: 3,
      stepTotal: 10,
      etaSeconds: 12,
      error: null,
    }
    const item = baseItem({ status: "processing", ingest })
    const mapped = mapDocument(item)
    expect(mapped.ingest).toEqual(ingest)
    expect(mapped.status).toBe("processing")
  })

  it("falls back to 'ready' when status is empty string", () => {
    const item = baseItem({ status: "" })
    const mapped = mapDocument(item)
    expect(mapped.status).toBe("ready")
  })

  it("keeps ingest as null when undefined", () => {
    const item = baseItem({ status: "ready", ingest: undefined })
    const mapped = mapDocument(item)
    expect(mapped.ingest).toBeNull()
  })

  it("preserves all other scalar fields used by the page", () => {
    const item = baseItem({
      id: "doc_X",
      title: "Annual review",
      fileSize: 4096,
      thumbnailUrl: "/thumb.png",
    })
    const mapped: DashboardDocument = mapDocument(item)
    expect(mapped.id).toBe("doc_X")
    expect(mapped.title).toBe("Annual review")
    expect(mapped.fileSize).toBe(4096)
    expect(mapped.thumbnailUrl).toBe("/thumb.png")
    expect(mapped.chunkCount).toBe(12)
    expect(mapped.groups).toEqual([{ id: "g1", name: "Reports", color: "#000" }])
  })
})