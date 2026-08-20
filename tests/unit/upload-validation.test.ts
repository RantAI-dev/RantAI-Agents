import { describe, it, expect } from "vitest"
import { validateUpload } from "@/lib/s3"
import { KB_ACCEPTED_EXTENSIONS, KB_MAX_FILE_BYTES } from "@/lib/files/mime-types"

describe("validateUpload (document)", () => {
  it("accepts a normal pdf", () => {
    expect(validateUpload("document", 1024, "application/pdf", "a.pdf").valid).toBe(true)
  })

  it("falls back to the extension when the browser sends no MIME", () => {
    expect(validateUpload("document", 1024, "", "script.py").valid).toBe(true)
    expect(validateUpload("document", 1024, "", "config.env").valid).toBe(true)
    expect(validateUpload("document", 1024, "application/octet-stream", "notes.md").valid).toBe(true)
  })

  it("rejects unsupported types with the filename in the message", () => {
    const r = validateUpload("document", 1024, "application/x-msdownload", "virus.exe")
    expect(r.valid).toBe(false)
    expect(r.error).toContain("virus.exe")
  })

  it("rejects oversized files with size + limit in the message", () => {
    const r = validateUpload("document", KB_MAX_FILE_BYTES + 1, "application/pdf", "big.pdf")
    expect(r.valid).toBe(false)
    expect(r.error).toContain("big.pdf")
    expect(r.error).toContain("50MB")
  })

  it("every registry extension passes with an empty browser MIME", () => {
    for (const ext of KB_ACCEPTED_EXTENSIONS) {
      expect(validateUpload("document", 1024, "", `file${ext}`).valid, ext).toBe(true)
    }
  })
})
