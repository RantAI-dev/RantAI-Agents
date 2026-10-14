import {
  FileText,
  FileType,
  Image,
  Globe,
  FileCode,
  GitBranch,
  Code,
  Table2,
  Sigma,
  Presentation,
  Terminal,
  BookOpen,
  FileSpreadsheet,
  Box,
  type IconComponent,
} from "@/lib/icons"

export interface FileTypeDetails {
  extension: string
  Icon: IconComponent
  bgColor: string
  iconColor: string
  accentColor: string
}

export interface ExistingDocSummary {
  id?: string
  title: string
  fileSize?: number | null
  s3Key?: string | null
  mimeType?: string | null
}

const ARTIFACT_TYPE_MAP: Record<string, FileTypeDetails> = {
  "text/html": {
    extension: ".HTML",
    Icon: Globe,
    bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
    iconColor: "text-orange-500",
    accentColor: "#f97316",
  },
  "application/react": {
    extension: ".TSX",
    Icon: FileCode,
    bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
    iconColor: "text-blue-500",
    accentColor: "#3b82f6",
  },
  "image/svg+xml": {
    extension: ".SVG",
    Icon: Image,
    bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
    iconColor: "text-emerald-500",
    accentColor: "#10b981",
  },
  "application/mermaid": {
    extension: ".MMD",
    Icon: GitBranch,
    bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
    iconColor: "text-purple-500",
    accentColor: "#a855f7",
  },
  "text/markdown": {
    extension: ".MD",
    Icon: FileText,
    bgColor: "bg-gray-500/10 dark:bg-gray-500/20",
    iconColor: "text-gray-500",
    accentColor: "#6b7280",
  },
  "application/code": {
    extension: ".CODE",
    Icon: Code,
    bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
    iconColor: "text-cyan-500",
    accentColor: "#06b6d4",
  },
  "application/sheet": {
    extension: ".CSV",
    Icon: Table2,
    bgColor: "bg-green-500/10 dark:bg-green-500/20",
    iconColor: "text-green-500",
    accentColor: "#22c55e",
  },
  "text/latex": {
    extension: ".TEX",
    Icon: Sigma,
    bgColor: "bg-rose-500/10 dark:bg-rose-500/20",
    iconColor: "text-rose-500",
    accentColor: "#f43f5e",
  },
  "application/slides": {
    extension: ".PPTX",
    Icon: Presentation,
    bgColor: "bg-indigo-500/10 dark:bg-indigo-500/20",
    iconColor: "text-indigo-500",
    accentColor: "#6366f1",
  },
  "application/python": {
    extension: ".PY",
    Icon: Terminal,
    bgColor: "bg-yellow-500/10 dark:bg-yellow-500/20",
    iconColor: "text-yellow-500",
    accentColor: "#eab308",
  },
}

const MIME_TO_EXT: Record<string, string> = {
  "application/pdf": ".pdf",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ".xlsx",
  "application/vnd.ms-excel": ".xls",
  "text/csv": ".csv",
  "text/tab-separated-values": ".tsv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
  "application/msword": ".doc",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": ".pptx",
  "application/vnd.ms-powerpoint": ".ppt",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "text/markdown": ".md",
  "text/plain": ".txt",
  "application/json": ".json",
}

/**
 * Extracts the file extension (with leading dot, lowercase) from filename, s3Key,
 * mimeType, fileType, or artifactType.
 */
export function getOriginalExtension(params: {
  filename?: string | null
  s3Key?: string | null
  mimeType?: string | null
  fileType?: string | null
  artifactType?: string | null
}): string {
  const { filename, s3Key, mimeType, fileType, artifactType } = params

  if (artifactType && ARTIFACT_TYPE_MAP[artifactType]) {
    return ARTIFACT_TYPE_MAP[artifactType].extension.toLowerCase()
  }

  // Check s3Key first (often contains the exact uploaded file name)
  if (s3Key) {
    const s3Part = s3Key.split("/").pop() || ""
    const s3Match = s3Part.match(/(\.[a-zA-Z0-9]+)$/)
    if (s3Match) {
      return s3Match[1].toLowerCase()
    }
  }

  // Check filename or title
  if (filename) {
    const fnMatch = filename.match(/(\.[a-zA-Z0-9]+)$/)
    if (fnMatch) {
      return fnMatch[1].toLowerCase()
    }
  }

  // Check mimeType
  if (mimeType && MIME_TO_EXT[mimeType]) {
    return MIME_TO_EXT[mimeType]
  }

  // Fall back to fileType enum
  if (fileType === "pdf") return ".pdf"
  if (fileType === "image") return ".png"

  return ".md"
}

/**
 * Returns complete file type visual metadata (Icon, colors, extension label)
 * consistent between upload dialog, document cards, and document preview.
 */
export function getFileTypeDetails(params: {
  filename?: string | null
  s3Key?: string | null
  mimeType?: string | null
  fileType?: string | null
  artifactType?: string | null
}): FileTypeDetails {
  const { artifactType } = params
  if (artifactType && ARTIFACT_TYPE_MAP[artifactType]) {
    return ARTIFACT_TYPE_MAP[artifactType]
  }

  const ext = getOriginalExtension(params)
  const label = ext.toUpperCase()

  // PDF
  if (ext === ".pdf") {
    return {
      extension: label,
      Icon: FileType,
      bgColor: "bg-red-500/10 dark:bg-red-500/20",
      iconColor: "text-red-500",
      accentColor: "#ef4444",
    }
  }

  // Spreadsheets / Data
  if ([".xlsx", ".xls", ".ods", ".csv", ".tsv"].includes(ext)) {
    return {
      extension: label,
      Icon: FileSpreadsheet,
      bgColor: "bg-emerald-500/10 dark:bg-emerald-500/20",
      iconColor: "text-emerald-500",
      accentColor: "#10b981",
    }
  }

  // Word / Text documents
  if ([".docx", ".doc", ".rtf", ".odt", ".epub"].includes(ext)) {
    return {
      extension: label,
      Icon: BookOpen,
      bgColor: "bg-blue-500/10 dark:bg-blue-500/20",
      iconColor: "text-blue-500",
      accentColor: "#3b82f6",
    }
  }

  // Presentations
  if ([".pptx", ".ppt"].includes(ext)) {
    return {
      extension: label,
      Icon: Presentation,
      bgColor: "bg-orange-500/10 dark:bg-orange-500/20",
      iconColor: "text-orange-500",
      accentColor: "#f97316",
    }
  }

  // Images
  if ([".png", ".jpg", ".jpeg", ".gif", ".webp", ".heic"].includes(ext)) {
    return {
      extension: label,
      Icon: Image,
      bgColor: "bg-amber-500/10 dark:bg-amber-500/20",
      iconColor: "text-amber-500",
      accentColor: "#f59e0b",
    }
  }

  // Code & JSON
  if (
    [
      ".py", ".ts", ".tsx", ".js", ".jsx", ".go", ".rs", ".java",
      ".c", ".cpp", ".h", ".rb", ".php", ".sh", ".sql", ".swift",
      ".kt", ".json", ".jsonl",
    ].includes(ext)
  ) {
    return {
      extension: label,
      Icon: FileCode,
      bgColor: "bg-purple-500/10 dark:bg-purple-500/20",
      iconColor: "text-purple-500",
      accentColor: "#a855f7",
    }
  }

  // 3D
  if ([".gltf", ".glb"].includes(ext)) {
    return {
      extension: label,
      Icon: Box,
      bgColor: "bg-cyan-500/10 dark:bg-cyan-500/20",
      iconColor: "text-cyan-500",
      accentColor: "#06b6d4",
    }
  }

  // Markdown & Text fallback
  return {
    extension: label.length > 1 ? label : ".MD",
    Icon: FileText,
    bgColor: "bg-slate-500/10 dark:bg-slate-500/20",
    iconColor: "text-slate-500",
    accentColor: "#64748b",
  }
}

/**
 * Checks if a new file upload is a potential duplicate of an existing document
 * based on matching file size AND original filename (either title or s3Key).
 */
export function checkDuplicateUpload(
  newFile: { name: string; size: number },
  existingDocs: ExistingDocSummary[]
): { isDuplicate: boolean; matchedDoc?: ExistingDocSummary } {
  if (!newFile || !existingDocs?.length) {
    return { isDuplicate: false }
  }

  const newNameLower = newFile.name.trim().toLowerCase()
  const newBaseLower = newNameLower.replace(/\.[^/.]+$/, "")

  const matched = existingDocs.find((doc) => {
    // 1. Must match file size if size is available
    if (doc.fileSize != null && doc.fileSize !== newFile.size) {
      return false
    }

    // 2. Check s3Key (often stores /.../filename.ext)
    if (doc.s3Key) {
      const s3FileName = doc.s3Key.split("/").pop()?.toLowerCase()
      if (s3FileName && (s3FileName === newNameLower || s3FileName.replace(/\.[^/.]+$/, "") === newBaseLower)) {
        return true
      }
    }

    // 3. Check title (may be full name or base name without extension)
    const docTitleLower = doc.title.trim().toLowerCase()
    if (docTitleLower === newNameLower || docTitleLower === newBaseLower) {
      return true
    }

    return false
  })

  return matched ? { isDuplicate: true, matchedDoc: matched } : { isDuplicate: false }
}

/**
 * Counts documents belonging to a specific KB folder (excluding artifacts),
 * or total non-artifact documents when viewing All Documents.
 */
export function countKBDocuments(
  documents: Array<{ artifactType?: string | null; groups?: Array<{ id: string }> }>,
  selectedKBId?: string | null
): number {
  if (!Array.isArray(documents)) return 0

  if (selectedKBId) {
    return documents.filter(
      (d) => d.artifactType == null && Array.isArray(d.groups) && d.groups.some((g) => g.id === selectedKBId)
    ).length
  }

  return documents.filter((d) => d.artifactType == null).length
}

/**
 * Filters documents for display inside a KB folder.
 * Ensures:
 * 1. Documents with "No KB" (empty groups) NEVER appear inside a KB folder.
 * 2. Documents from other KBs NEVER appear inside this KB folder.
 * 3. Artifacts (artifactType != null) NEVER appear inside a KB folder.
 * When viewing All Documents (selectedKBId is null), returns all documents.
 */
export function filterDocumentsForKBFolder<
  T extends { artifactType?: string | null; groups?: Array<{ id: string }> }
>(
  documents: T[],
  selectedKBId?: string | null
): T[] {
  if (!Array.isArray(documents)) return []
  if (!selectedKBId) return documents

  return documents.filter(
    (d) => d.artifactType == null && Array.isArray(d.groups) && d.groups.some((g) => g.id === selectedKBId)
  )
}

/**
 * Returns formatted label and color for a category, resolving from categoryMap if present,
 * or falling back to humanized name and default color.
 */
export function getCategoryDisplay(
  categoryName: string,
  categoryMap?: Map<string, { label: string; color: string }> | null
): { label: string; color: string } {
  if (categoryMap) {
    const category = categoryMap.get(categoryName)
    if (category) {
      return { label: category.label, color: category.color }
    }
  }
  return {
    label: categoryName
      .replace(/_/g, " ")
      .toLowerCase()
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    color: "#6b7280",
  }
}
