import { describe, it, expect, beforeEach } from "vitest"
import { configureKb, kb, hasKbPort, resetKbRuntime } from "@/lib/kb-runtime/runtime"
import type { BlobStore, ProgressSink } from "@/lib/kb-runtime/ports"

const fakeBlob: BlobStore = {
  upload: async () => ({ size: 1 }),
  download: async () => Buffer.from("x"),
  delete: async () => {},
  documentPath: (org, doc, name) => `documents/${org ?? "global"}/${doc}/${name}`,
  assetPath: (org, doc, name) => `documents/${org ?? "global"}/${doc}/assets/${name}`,
}

describe("kb runtime registry", () => {
  beforeEach(() => resetKbRuntime())

  it("throws a named error for an unconfigured port", () => {
    expect(() => kb("blob")).toThrowError(/port "blob" is not configured/)
    expect(() => kb("jobs")).toThrowError(/port "jobs" is not configured/)
  })

  it("returns registered adapters", () => {
    configureKb({ blob: fakeBlob })
    expect(kb("blob")).toBe(fakeBlob)
    expect(kb("blob").documentPath(null, "doc1", "a.pdf")).toBe("documents/global/doc1/a.pdf")
  })

  it("merges partial configuration instead of replacing it", () => {
    const progress: ProgressSink = { emit: async () => {} }
    configureKb({ blob: fakeBlob })
    configureKb({ progress })
    expect(kb("blob")).toBe(fakeBlob)
    expect(kb("progress")).toBe(progress)
  })

  it("hasKbPort reports availability without throwing", () => {
    expect(hasKbPort("vectors")).toBe(false)
    configureKb({ blob: fakeBlob })
    expect(hasKbPort("blob")).toBe(true)
  })

  it("reset drops everything", () => {
    configureKb({ blob: fakeBlob })
    resetKbRuntime()
    expect(hasKbPort("blob")).toBe(false)
  })
})
