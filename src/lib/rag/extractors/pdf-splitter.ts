import { PDFDocument } from "pdf-lib";

/**
 * Split a PDF buffer into N-page segments.
 *
 * Used by VisionLlmExtractor to parallelize extraction across big docs —
 * the vision model's output-token budget caps single-call extraction at
 * ~30-40 pages of dense markdown, so we chop and extract in parallel.
 *
 * If total pages <= pagesPerSegment, returns [pdfBuffer] unchanged (no copy).
 */
export async function splitPdfByPageCount(
  pdfBuffer: Buffer,
  pagesPerSegment: number
): Promise<Buffer[]> {
  if (pagesPerSegment < 1) throw new Error("pagesPerSegment must be >= 1");
  const source = await PDFDocument.load(pdfBuffer);
  const totalPages = source.getPageCount();
  if (totalPages <= pagesPerSegment) return [pdfBuffer];

  const segments: Buffer[] = [];
  for (let start = 0; start < totalPages; start += pagesPerSegment) {
    const end = Math.min(start + pagesPerSegment, totalPages);
    const segment = await PDFDocument.create();
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i);
    const copiedPages = await segment.copyPages(source, pageIndices);
    for (const p of copiedPages) segment.addPage(p);
    const bytes = await segment.save();
    segments.push(Buffer.from(bytes));
  }
  return segments;
}

/** Probe page count without a full load. Useful when deciding whether to split. */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
  return doc.getPageCount();
}
