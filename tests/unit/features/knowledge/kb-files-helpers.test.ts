import { describe, it, expect } from "vitest"
import {
  getOriginalExtension,
  getFileTypeDetails,
  checkDuplicateUpload,
  countKBDocuments,
  filterDocumentsForKBFolder,
  getCategoryDisplay,
} from "@/features/knowledge/components/kb-files-helpers"
import {
  FileType,
  BookOpen,
  FileSpreadsheet,
  Presentation,
  Image,
  FileCode,
  FileText,
} from "@/lib/icons"

describe("kb-files-helpers", () => {
  describe("getOriginalExtension & getFileTypeDetails", () => {
    it("maps PDF correctly to red FileType and .PDF label", () => {
      const details = getFileTypeDetails({ filename: "report.pdf" })
      expect(details.extension).toBe(".PDF")
      expect(details.Icon).toBe(FileType)
      expect(details.iconColor).toContain("red")
    })

    it("maps XLSX to emerald FileSpreadsheet and .XLSX label", () => {
      const details = getFileTypeDetails({ filename: "finance.xlsx" })
      expect(details.extension).toBe(".XLSX")
      expect(details.Icon).toBe(FileSpreadsheet)
      expect(details.iconColor).toContain("emerald")
    })

    it("maps CSV to emerald FileSpreadsheet and .CSV label", () => {
      const details = getFileTypeDetails({ filename: "data.csv" })
      expect(details.extension).toBe(".CSV")
      expect(details.Icon).toBe(FileSpreadsheet)
      expect(details.iconColor).toContain("emerald")
    })

    it("maps DOCX to blue BookOpen and .DOCX label", () => {
      const details = getFileTypeDetails({ filename: "proposal.docx" })
      expect(details.extension).toBe(".DOCX")
      expect(details.Icon).toBe(BookOpen)
      expect(details.iconColor).toContain("blue")
    })

    it("maps PPTX to orange Presentation and .PPTX label", () => {
      const details = getFileTypeDetails({ filename: "pitch.pptx" })
      expect(details.extension).toBe(".PPTX")
      expect(details.Icon).toBe(Presentation)
      expect(details.iconColor).toContain("orange")
    })

    it("maps images to amber Image icon", () => {
      const details = getFileTypeDetails({ filename: "photo.png" })
      expect(details.extension).toBe(".PNG")
      expect(details.Icon).toBe(Image)
      expect(details.iconColor).toContain("amber")
    })

    it("maps code files to purple FileCode icon", () => {
      const details = getFileTypeDetails({ filename: "script.py" })
      expect(details.extension).toBe(".PY")
      expect(details.Icon).toBe(FileCode)
      expect(details.iconColor).toContain("purple")
    })

    it("resolves extension from s3Key when filename has no extension", () => {
      const ext = getOriginalExtension({
        filename: "Quarterly Report",
        s3Key: "organizations/org-1/documents/doc-1/Quarterly Report.xlsx",
      })
      expect(ext).toBe(".xlsx")

      const details = getFileTypeDetails({
        filename: "Quarterly Report",
        s3Key: "organizations/org-1/documents/doc-1/Quarterly Report.xlsx",
      })
      expect(details.extension).toBe(".XLSX")
      expect(details.Icon).toBe(FileSpreadsheet)
    })

    it("resolves extension from mimeType when filename and s3Key lack extension", () => {
      const ext = getOriginalExtension({
        filename: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      })
      expect(ext).toBe(".pptx")

      const details = getFileTypeDetails({
        filename: "document",
        mimeType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      })
      expect(details.extension).toBe(".PPTX")
      expect(details.Icon).toBe(Presentation)
    })

    it("handles artifacts with dedicated types", () => {
      const details = getFileTypeDetails({ artifactType: "application/sheet" })
      expect(details.extension).toBe(".CSV")
      expect(details.iconColor).toContain("green")
    })
  })

  describe("checkDuplicateUpload", () => {
    const existing = [
      {
        id: "doc-1",
        title: "qa-sample-kebijakan-kredit.pdf",
        fileSize: 322560,
        s3Key: "organizations/org-1/documents/doc-1/qa-sample-kebijakan-kredit.pdf",
      },
      {
        id: "doc-2",
        title: "Financial Report 2024",
        fileSize: 1048576,
        s3Key: "organizations/org-1/documents/doc-2/Financial_Report_2024.xlsx",
      },
    ]

    it("detects duplicate when name and size match exactly", () => {
      const result = checkDuplicateUpload(
        { name: "qa-sample-kebijakan-kredit.pdf", size: 322560 },
        existing
      )
      expect(result.isDuplicate).toBe(true)
      expect(result.matchedDoc?.id).toBe("doc-1")
    })

    it("detects duplicate when title was saved without extension", () => {
      const result = checkDuplicateUpload(
        { name: "Financial Report 2024.xlsx", size: 1048576 },
        existing
      )
      expect(result.isDuplicate).toBe(true)
      expect(result.matchedDoc?.id).toBe("doc-2")
    })

    it("does not flag duplicate when file size differs (positive control: same size matches)", () => {
      // Positive control: same name with same size matches
      const positive = checkDuplicateUpload(
        { name: "qa-sample-kebijakan-kredit.pdf", size: 322560 },
        existing
      )
      expect(positive.isDuplicate).toBe(true)

      // Test negative: same name with different size does NOT match
      const negative = checkDuplicateUpload(
        { name: "qa-sample-kebijakan-kredit.pdf", size: 999999 },
        existing
      )
      expect(negative.isDuplicate).toBe(false)
    })

    it("does not flag duplicate when name differs (positive control: matching name matches)", () => {
      // Positive control: matching name and size
      const positive = checkDuplicateUpload(
        { name: "Financial Report 2024.xlsx", size: 1048576 },
        existing
      )
      expect(positive.isDuplicate).toBe(true)

      // Test negative: different name with same size does NOT match
      const negative = checkDuplicateUpload(
        { name: "Completely_Different_File.xlsx", size: 1048576 },
        existing
      )
      expect(negative.isDuplicate).toBe(false)
    })

    it("returns false for empty list of existing documents", () => {
      const result = checkDuplicateUpload(
        { name: "file.pdf", size: 12345 },
        []
      )
      expect(result.isDuplicate).toBe(false)
    })
  })

  describe("countKBDocuments & filterDocumentsForKBFolder", () => {
    const docs = [
      { id: "1", title: "Doc in KB A", groups: [{ id: "kb-a" }], artifactType: null },
      { id: "2", title: "Doc in KB A & B", groups: [{ id: "kb-a" }, { id: "kb-b" }], artifactType: null },
      { id: "3", title: "Doc in KB B only", groups: [{ id: "kb-b" }], artifactType: null },
      { id: "4", title: "Doc with No KB", groups: [], artifactType: null },
      { id: "5", title: "Artifact in KB A", groups: [{ id: "kb-a" }], artifactType: "text/markdown" },
      { id: "6", title: "Global Artifact", groups: [], artifactType: "application/react" },
    ]

    it("counts only regular documents belonging to KB folder, excluding artifacts and No KB", () => {
      // KB A has Doc 1 and Doc 2 (Doc 5 is an artifact, so excluded)
      const countA = countKBDocuments(docs, "kb-a")
      expect(countA).toBe(2)

      // KB B has Doc 2 and Doc 3
      const countB = countKBDocuments(docs, "kb-b")
      expect(countB).toBe(2)
    })

    it("counts all regular documents when viewing All Documents (selectedKBId is null)", () => {
      // Regular docs are 1, 2, 3, 4 (4 regular docs, 2 artifacts excluded)
      const countAll = countKBDocuments(docs, null)
      expect(countAll).toBe(4)
    })

    it("filters documents strictly for KB folder, excluding No KB and other KBs", () => {
      const filtered = filterDocumentsForKBFolder(docs, "kb-a")
      expect(filtered.map((d) => d.id)).toEqual(["1", "2"])

      // Positive control: adding kb-a to doc 4 includes it
      const doc4WithKB = { ...docs[3], groups: [{ id: "kb-a" }] }
      const filteredWithDoc4 = filterDocumentsForKBFolder([...docs.slice(0, 3), doc4WithKB], "kb-a")
      expect(filteredWithDoc4.map((d) => d.id)).toContain("4")
    })

    it("returns all documents when viewing All Documents (selectedKBId is null)", () => {
      const filtered = filterDocumentsForKBFolder(docs, null)
      expect(filtered.length).toBe(docs.length)
    })
  })
  describe("getCategoryDisplay", () => {
    const map = new Map([
      ["POLICY", { label: "Insurance Policy", color: "#3b82f6" }],
      ["HEALTH_INSURANCE", { label: "Health Coverage", color: "#10b981" }],
    ])

    it("resolves label and color from categoryMap when found", () => {
      const res = getCategoryDisplay("POLICY", map)
      expect(res.label).toBe("Insurance Policy")
      expect(res.color).toBe("#3b82f6")
    })

    it("formats category name properly when not in map", () => {
      const res = getCategoryDisplay("CUSTOMER_SUPPORT", map)
      expect(res.label).toBe("Customer Support")
      expect(res.color).toBe("#6b7280")
    })

    it("handles null or undefined map gracefully", () => {
      const res = getCategoryDisplay("FINANCIAL_REPORTS", null)
      expect(res.label).toBe("Financial Reports")
      expect(res.color).toBe("#6b7280")
    })
  })
})
