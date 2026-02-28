/**
 * Central MIME type and extension registry.
 * Used by all upload routes, file processors, and S3 validation.
 */

// ─── Knowledge base document upload ───────────────────────────────────────────
export const DOCUMENT_MIME_TYPES = [
  // Existing
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "text/plain",
  "text/markdown",
  // Office (Tier 1)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
  "application/vnd.openxmlformats-officedocument.presentationml.presentation", // .pptx
  // Structured data (Tier 1)
  "text/csv",
  "text/tab-separated-values",
  "application/json",
  "application/x-ndjson",
  "text/html",
  "application/xml",
  "text/xml",
  // Rich text & ebooks (Tier 2)
  "application/rtf",
  "application/epub+zip",
  // Config / code (Tier 2)
  "text/yaml",
  "application/toml",
  "text/x-python",
  "text/javascript",
  "text/typescript",
  // Legacy Office (Tier 3)
  "application/msword",                          // .doc
  "application/vnd.ms-excel",                    // .xls
  "application/vnd.ms-powerpoint",               // .ppt
  // OpenDocument (Tier 3)
  "application/vnd.oasis.opendocument.text",         // .odt
  "application/vnd.oasis.opendocument.spreadsheet",  // .ods
  // 3D models (Tier 3)
  "model/gltf+json",                            // .gltf
  "model/gltf-binary",                           // .glb
] as const

export type DocumentMimeType = (typeof DOCUMENT_MIME_TYPES)[number]

// ─── Chat / widget attachment upload (no HEIC — browsers can't produce it) ───
export const CHAT_ATTACHMENT_MIME_TYPES = DOCUMENT_MIME_TYPES.filter(
  (t) => t !== "image/heic"
) as readonly string[]

// ─── Extension → MIME ────────────────────────────────────────────────────────
export const EXT_TO_MIME: Record<string, string> = {
  // Documents
  ".pdf": "application/pdf",
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  // Text / markup
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".txt": "text/plain",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  // Data / config
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".toml": "application/toml",
  // Office
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  // Rich text / ebook
  ".rtf": "application/rtf",
  ".epub": "application/epub+zip",
  // Legacy Office
  ".doc": "application/msword",
  ".xls": "application/vnd.ms-excel",
  ".ppt": "application/vnd.ms-powerpoint",
  // OpenDocument
  ".odt": "application/vnd.oasis.opendocument.text",
  ".ods": "application/vnd.oasis.opendocument.spreadsheet",
  // 3D models
  ".gltf": "model/gltf+json",
  ".glb": "model/gltf-binary",
  // Misc text
  ".log": "text/plain",
  ".ini": "text/plain",
  ".env": "text/plain",
  // Code — specific MIME where available, text/plain as fallback
  ".py": "text/x-python",
  ".ts": "text/typescript",
  ".tsx": "text/typescript",
  ".js": "text/javascript",
  ".jsx": "text/javascript",
  ".go": "text/plain",
  ".rs": "text/plain",
  ".java": "text/plain",
  ".c": "text/plain",
  ".cpp": "text/plain",
  ".h": "text/plain",
  ".rb": "text/plain",
  ".php": "text/plain",
  ".sh": "text/plain",
  ".sql": "text/plain",
  ".r": "text/plain",
  ".swift": "text/plain",
  ".kt": "text/plain",
}

// ─── MIME → canonical extension (first-match wins) ───────────────────────────
export const MIME_TO_EXT: Record<string, string> = Object.entries(EXT_TO_MIME).reduce<
  Record<string, string>
>((acc, [ext, mime]) => {
  if (!acc[mime]) acc[mime] = ext
  return acc
}, {})

/** Returns true if the given MIME type is accepted for knowledge base upload. */
export function isDocumentMime(mimeType: string): boolean {
  return (DOCUMENT_MIME_TYPES as readonly string[]).includes(mimeType)
}

/** Returns true if the given MIME type is accepted for chat/widget attachment. */
export function isChatAttachmentMime(mimeType: string): boolean {
  return CHAT_ATTACHMENT_MIME_TYPES.includes(mimeType)
}
