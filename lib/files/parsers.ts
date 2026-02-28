/**
 * Universal text extractor for all supported file types.
 * Both the knowledge-base pipeline and the chat-attachment pipeline call this.
 *
 * extractTextFromBuffer(buffer, mimeType, fileName) → string
 */

import path from "path"

// ─── Helpers ─────────────────────────────────────────────────────────────────

function stripHtml(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

const CODE_EXT_LANGUAGE: Record<string, string> = {
  ".py": "python",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "c",
  ".cpp": "cpp",
  ".h": "c",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "bash",
  ".sql": "sql",
  ".r": "r",
  ".swift": "swift",
  ".kt": "kotlin",
}

// ─── Parsers ─────────────────────────────────────────────────────────────────

async function parseDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth")
  const result = await mammoth.extractRawText({ buffer })
  return result.value
}

async function parseXlsx(buffer: Buffer, fileName: string): Promise<string> {
  const XLSX = await import("xlsx")
  const workbook = XLSX.read(buffer, { type: "buffer" })
  const sections: string[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { FS: ",", blankrows: false })
    if (csv.trim()) {
      sections.push(`[Sheet: ${sheetName}]\n${csv}`)
    }
  }

  return sections.length
    ? `[Spreadsheet: ${fileName}]\n\n${sections.join("\n\n")}`
    : `[Spreadsheet: ${fileName}]\n\n(empty)`
}

async function parsePptx(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const officeparser = require("officeparser") as {
    parseOffice: (
      file: Buffer,
      callback: (text: string, err?: Error) => void,
      config?: Record<string, unknown>
    ) => void
  }
  return new Promise((resolve, reject) => {
    officeparser.parseOffice(buffer, (text: string, err?: Error) => {
      if (err) reject(err)
      else resolve(text || "")
    }, { outputErrorToConsole: false })
  })
}

async function parseRtf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rtfToHtml = require("@iarna/rtf-to-html") as {
    fromString: (rtf: string, cb: (err: Error | null, html: string) => void) => void
  }
  return new Promise((resolve, reject) => {
    rtfToHtml.fromString(buffer.toString("binary"), (err: Error | null, html: string) => {
      if (err) reject(err)
      else resolve(stripHtml(html || ""))
    })
  })
}

async function parseEpub(buffer: Buffer, fileName: string): Promise<string> {
  const EPub = (await import("epub2")).default
  // epub2 needs a file path, so write to a temp file
  const os = await import("os")
  const fs = await import("fs/promises")
  const tmpPath = path.join(os.tmpdir(), `rantai-${Date.now()}-${Math.random().toString(36).slice(2)}.epub`)

  try {
    await fs.writeFile(tmpPath, buffer)
    const epub = await EPub.createAsync(tmpPath)

    const chapters: string[] = []
    for (const chapter of epub.flow) {
      if (!chapter.id) continue
      try {
        const [text] = await epub.getChapterRawAsync(chapter.id)
        const clean = stripHtml(text || "")
        if (clean.trim()) chapters.push(clean)
      } catch {
        // skip unreadable chapters
      }
    }

    return chapters.length
      ? `[EPUB: ${fileName}]\n\n${chapters.join("\n\n---\n\n")}`
      : `[EPUB: ${fileName}]\n\n(no readable content)`
  } finally {
    await fs.unlink(tmpPath).catch(() => {})
  }
}

// ─── Legacy Office + OpenDocument (via officeparser) ────────────────────────

async function parseOfficeGeneric(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const officeparser = require("officeparser") as {
    parseOffice: (
      file: Buffer,
      callback: (text: string, err?: Error) => void,
      config?: Record<string, unknown>
    ) => void
  }
  return new Promise((resolve, reject) => {
    officeparser.parseOffice(buffer, (text: string, err?: Error) => {
      if (err) reject(err)
      else resolve(text || "")
    }, { outputErrorToConsole: false })
  })
}

// ─── GLTF / GLB 3D model metadata extraction ───────────────────────────────

interface GLTFJson {
  asset?: { version?: string; generator?: string }
  scenes?: Array<{ name?: string; nodes?: number[] }>
  nodes?: Array<{ name?: string; mesh?: number; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }>
  meshes?: Array<{ name?: string; primitives?: unknown[] }>
  materials?: Array<{ name?: string; pbrMetallicRoughness?: unknown }>
  animations?: Array<{ name?: string; channels?: unknown[] }>
  textures?: Array<{ source?: number }>
  images?: Array<{ uri?: string; mimeType?: string; name?: string }>
  extensionsUsed?: string[]
}

function extractGltfMetadata(json: GLTFJson, fileName: string): string {
  const lines: string[] = [`[3D Model: ${fileName}]`, ""]

  if (json.asset) {
    lines.push(`Format: glTF ${json.asset.version || "2.0"}`)
    if (json.asset.generator) lines.push(`Generator: ${json.asset.generator}`)
    lines.push("")
  }

  if (json.scenes?.length) {
    lines.push(`Scenes (${json.scenes.length}):`)
    for (const s of json.scenes) lines.push(`  - ${s.name || "(unnamed)"}`)
    lines.push("")
  }

  if (json.nodes?.length) {
    lines.push(`Nodes (${json.nodes.length}):`)
    for (const n of json.nodes) lines.push(`  - ${n.name || "(unnamed)"}`)
    lines.push("")
  }

  if (json.meshes?.length) {
    lines.push(`Meshes (${json.meshes.length}):`)
    for (const m of json.meshes) lines.push(`  - ${m.name || "(unnamed)"}`)
    lines.push("")
  }

  if (json.materials?.length) {
    lines.push(`Materials (${json.materials.length}):`)
    for (const m of json.materials) lines.push(`  - ${m.name || "(unnamed)"}`)
    lines.push("")
  }

  if (json.animations?.length) {
    lines.push(`Animations (${json.animations.length}):`)
    for (const a of json.animations) lines.push(`  - ${a.name || "(unnamed)"}`)
    lines.push("")
  }

  if (json.textures?.length) lines.push(`Textures: ${json.textures.length}`)
  if (json.images?.length) lines.push(`Images: ${json.images.length}`)
  if (json.extensionsUsed?.length) lines.push(`Extensions: ${json.extensionsUsed.join(", ")}`)

  return lines.join("\n").trim()
}

function parseGltfJson(buffer: Buffer, fileName: string): string {
  const json = JSON.parse(buffer.toString("utf-8")) as GLTFJson
  return extractGltfMetadata(json, fileName)
}

function parseGlb(buffer: Buffer, fileName: string): string {
  // GLB format: 12-byte header, then chunks
  // Header: magic (4) + version (4) + length (4)
  // Chunk: length (4) + type (4) + data (length)
  // First chunk is always JSON (type 0x4E4F534A)
  if (buffer.length < 20) throw new Error("GLB file too small")

  const magic = buffer.readUInt32LE(0)
  if (magic !== 0x46546C67) throw new Error("Invalid GLB magic number")

  const jsonChunkLength = buffer.readUInt32LE(12)
  const jsonChunkData = buffer.subarray(20, 20 + jsonChunkLength)
  const json = JSON.parse(jsonChunkData.toString("utf-8")) as GLTFJson

  return extractGltfMetadata(json, fileName)
}

// ─── Main dispatcher ─────────────────────────────────────────────────────────

/**
 * Extract text from a file buffer given its MIME type and original file name.
 * Returns a plain-text / markdown string suitable for chunking and embedding.
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  fileName: string
): Promise<string> {
  const ext = path.extname(fileName).toLowerCase()

  // ── Office formats ──────────────────────────────────────────────────────────
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return parseDocx(buffer)
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return parseXlsx(buffer, fileName)
  }

  if (mimeType === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
    return parsePptx(buffer)
  }

  // ── Rich text / ebook ───────────────────────────────────────────────────────
  if (mimeType === "application/rtf") {
    return parseRtf(buffer)
  }

  if (mimeType === "application/epub+zip") {
    return parseEpub(buffer, fileName)
  }

  // ── Legacy Office + OpenDocument ──────────────────────────────────────────
  if (
    mimeType === "application/msword" ||
    mimeType === "application/vnd.ms-excel" ||
    mimeType === "application/vnd.ms-powerpoint" ||
    mimeType === "application/vnd.oasis.opendocument.text" ||
    mimeType === "application/vnd.oasis.opendocument.spreadsheet"
  ) {
    return parseOfficeGeneric(buffer)
  }

  // ── 3D Models ─────────────────────────────────────────────────────────────
  if (mimeType === "model/gltf+json") {
    return parseGltfJson(buffer, fileName)
  }

  if (mimeType === "model/gltf-binary") {
    return parseGlb(buffer, fileName)
  }

  // ── HTML / XML ──────────────────────────────────────────────────────────────
  if (mimeType === "text/html") {
    return stripHtml(buffer.toString("utf-8"))
  }

  if (mimeType === "application/xml" || mimeType === "text/xml") {
    // Strip XML tags, preserve text nodes
    return buffer
      .toString("utf-8")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  }

  // ── Code files ──────────────────────────────────────────────────────────────
  const codeLang = CODE_EXT_LANGUAGE[ext]
  if (codeLang) {
    const code = buffer.toString("utf-8")
    return `[Code: ${fileName}]\n\`\`\`${codeLang}\n${code}\n\`\`\``
  }

  // ── Everything else: CSV, TSV, JSON, JSONL, YAML, TOML, plain text ─────────
  return buffer.toString("utf-8")
}
