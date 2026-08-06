/**
 * IKAT-Bench step 1 — extract the textbook corpus, PRESERVING FIGURE ANCHORS.
 *
 * This is the step the production pipeline gets wrong today: Mistral OCR returns
 * each page's markdown with the figure referenced INLINE as `![id](id)`, exactly
 * where the figure sits in the reading order. Production splits that into a text
 * blob and a separate figures[] array, discarding the one piece of information
 * that says where the figure belongs — and then spends retrieval-time effort
 * guessing it back from caption keywords.
 *
 * Here we keep it. The marker's character offset in the page markdown IS the
 * anchor, and the book's own typesetting is therefore our placement ground truth.
 *
 * We also cache the RAW OCR response to disk. Two reasons, both learned the hard
 * way: (a) re-extraction costs money and hours, and every later experiment can
 * then be replayed offline; (b) a benchmark whose corpus cannot be rebuilt
 * byte-for-byte is not reproducible, and reviewers ask.
 *
 * Idempotent and resumable: a book already extracted is skipped, so an
 * interrupted overnight run continues where it stopped.
 *
 * Usage:
 *   bun tests/bench-kb/src/ikat/extract-corpus.ts [--limit N] [--src DIR]
 */
import * as fs from "node:fs"
import * as path from "node:path"
import { loadEnv, requireEnv, REPO_ROOT } from "./env"

loadEnv()

// ── Types mirroring the Mistral OCR response ───────────────────────────────

interface MistralImage {
  id: string
  top_left_x?: number
  top_left_y?: number
  bottom_right_x?: number
  bottom_right_y?: number
  image_base64?: string
}

interface MistralPage {
  index: number
  markdown?: string
  images?: MistralImage[]
  dimensions?: { dpi?: number; height?: number; width?: number }
}

/** What we persist per book (images written separately as PNG files). */
export interface RawExtraction {
  slug: string
  title: string
  sourcePdf: string
  model: string
  extractedAt: string
  pageCount: number
  figureCount: number
  /** Page markdown with the inline `![id](id)` markers left INTACT. */
  pages: Array<{ index: number; markdown: string; width?: number; height?: number }>
  /** Figure records; `assetFile` points at the written PNG. */
  figures: Array<{
    id: string
    page: number
    bbox: [number, number, number, number]
    assetFile: string
  }>
}

// ── Paths ──────────────────────────────────────────────────────────────────

const BENCH_ROOT = path.resolve(import.meta.dirname, "../..")
const RAW_DIR = path.join(BENCH_ROOT, "corpus", "raw")
const FIG_DIR = path.join(BENCH_ROOT, "corpus", "figures")

function slugify(name: string): string {
  return name
    .replace(/\.pdf$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
}

/** Book title from the sibling `*_metadata.json` when present, else the filename. */
function titleFor(pdfPath: string): string {
  const meta = pdfPath.replace(/\.pdf$/i, "_metadata.json")
  if (fs.existsSync(meta)) {
    try {
      const m = JSON.parse(fs.readFileSync(meta, "utf-8")) as { title?: string }
      if (m.title) return m.title
    } catch {
      /* fall through to filename */
    }
  }
  return path.basename(pdfPath).replace(/\.pdf$/i, "").replace(/_/g, " ")
}

// ── Extraction ─────────────────────────────────────────────────────────────

/** Above this, inline base64 is not viable and we go through the Files API. */
const INLINE_LIMIT_BYTES = 20 * 1024 * 1024

/**
 * Upload a PDF and return a short-lived signed URL.
 *
 * Needed because these books run to 121 MB, and a base64 data URL inflates that
 * to ~160 MB of JSON in a single request — which stalls rather than failing
 * cleanly, so it looks like a hang. The Files API streams the bytes instead.
 */
async function uploadForOcr(pdfPath: string, base: string, token: string): Promise<string> {
  const form = new FormData()
  form.append("purpose", "ocr")
  form.append("file", new Blob([fs.readFileSync(pdfPath)], { type: "application/pdf" }), path.basename(pdfPath))

  const up = await fetch(`${base}/v1/files`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  })
  if (!up.ok) throw new Error(`mistral files upload ${up.status}: ${(await up.text()).slice(0, 200)}`)
  const { id } = (await up.json()) as { id: string }

  const signed = await fetch(`${base}/v1/files/${id}/url?expiry=24`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!signed.ok) throw new Error(`mistral signed url ${signed.status}: ${(await signed.text()).slice(0, 200)}`)
  return ((await signed.json()) as { url: string }).url
}

async function extractBook(pdfPath: string): Promise<RawExtraction> {
  const token = requireEnv("KB_MISTRAL_OCR_KEY")
  const base = (process.env.KB_MISTRAL_OCR_BASE ?? "https://api.mistral.ai").replace(/\/+$/, "")
  const model = process.env.KB_MISTRAL_OCR_MODEL ?? "mistral-ocr-latest"

  const bytes = fs.statSync(pdfPath).size
  const documentUrl =
    bytes > INLINE_LIMIT_BYTES
      ? await uploadForOcr(pdfPath, base, token)
      : `data:application/pdf;base64,${fs.readFileSync(pdfPath).toString("base64")}`

  const res = await fetch(`${base}/v1/ocr`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      document: { type: "document_url", document_url: documentUrl },
      include_image_base64: true,
    }),
  })
  if (!res.ok) {
    throw new Error(`mistral ocr ${res.status}: ${(await res.text()).slice(0, 300)}`)
  }

  const data = (await res.json()) as { pages?: MistralPage[] }
  const pages = data.pages ?? []
  const slug = slugify(path.basename(pdfPath))

  const figDir = path.join(FIG_DIR, slug)
  fs.mkdirSync(figDir, { recursive: true })

  const figures: RawExtraction["figures"] = []
  for (const p of pages) {
    const W = p.dimensions?.width || 0
    const H = p.dimensions?.height || 0
    for (const img of p.images ?? []) {
      if (!img.image_base64) continue
      const b64 = img.image_base64.includes(",")
        ? img.image_base64.slice(img.image_base64.indexOf(",") + 1)
        : img.image_base64
      // Keep the OCR's own image id as the filename: it is what the inline
      // marker in the page markdown refers to, so the anchor stays resolvable.
      const file = `${img.id.replace(/[^\w.-]/g, "_")}.png`
      fs.writeFileSync(path.join(figDir, file), Buffer.from(b64, "base64"))
      figures.push({
        id: img.id,
        page: p.index,
        bbox:
          W > 0 && H > 0
            ? [
                (img.top_left_x ?? 0) / W,
                (img.top_left_y ?? 0) / H,
                (img.bottom_right_x ?? W) / W,
                (img.bottom_right_y ?? H) / H,
              ]
            : [0, 0, 1, 1],
        assetFile: path.join(slug, file),
      })
    }
  }

  return {
    slug,
    title: titleFor(pdfPath),
    sourcePdf: path.relative(REPO_ROOT, pdfPath),
    model,
    extractedAt: new Date().toISOString(),
    pageCount: pages.length,
    figureCount: figures.length,
    // The markers stay in: this is the whole point of the file.
    pages: pages.map((p) => ({
      index: p.index,
      markdown: p.markdown ?? "",
      width: p.dimensions?.width,
      height: p.dimensions?.height,
    })),
    figures,
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2)
  const limitArg = args.indexOf("--limit")
  const srcArg = args.indexOf("--src")
  const limit = limitArg >= 0 ? parseInt(args[limitArg + 1], 10) : Infinity
  const srcDir = srcArg >= 0 ? args[srcArg + 1] : path.join(REPO_ROOT, "contoh-data")

  fs.mkdirSync(RAW_DIR, { recursive: true })
  fs.mkdirSync(FIG_DIR, { recursive: true })

  const pdfs = fs
    .readdirSync(srcDir)
    .filter((f) => f.toLowerCase().endsWith(".pdf"))
    .sort()
    .map((f) => path.join(srcDir, f))

  console.log(`[ikat] corpus source: ${srcDir} (${pdfs.length} PDFs, limit ${limit})`)

  let done = 0
  let skipped = 0
  let failed = 0
  // Count ATTEMPTS, not successes: with a success-only counter a run against a
  // bad key burns through the whole corpus instead of stopping after --limit.
  let attempts = 0
  for (const pdf of pdfs) {
    if (attempts >= limit) break
    const slug = slugify(path.basename(pdf))
    const out = path.join(RAW_DIR, `${slug}.json`)
    if (fs.existsSync(out)) {
      skipped++
      console.log(`[ikat] skip (cached): ${slug}`)
      continue
    }
    attempts++
    const t0 = Date.now()
    try {
      const raw = await extractBook(pdf)
      fs.writeFileSync(out, JSON.stringify(raw, null, 2))
      done++
      console.log(
        `[ikat] ok: ${slug} — ${raw.pageCount}p, ${raw.figureCount} figures, ${((Date.now() - t0) / 1000).toFixed(1)}s`,
      )
    } catch (err) {
      failed++
      // Never abort the batch: one oversized or malformed book must not cost us
      // the other twelve on an unattended run.
      console.error(`[ikat] FAIL: ${slug} — ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`[ikat] extraction complete: ${done} extracted, ${skipped} cached, ${failed} failed`)
}

if (import.meta.main) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
