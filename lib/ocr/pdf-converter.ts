/**
 * PDF to Image Converter
 *
 * Converts PDF pages to images for OCR processing.
 * Detects whether a PDF is scanned (image-based) or digital (text-based).
 */

import type { PDFConversionOptions, ConvertedPage } from "./types";

/**
 * Check if a PDF is scanned (image-based) vs digital (text-based)
 *
 * Strategy: Extract text from first few pages. If very little text
 * is found, it's likely a scanned document that needs OCR.
 */
export async function isPDFScanned(pdfBuffer: Buffer): Promise<boolean> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
    const { text } = await extractText(pdf, { mergePages: true });

    // Count actual text content (excluding whitespace)
    const textLength = text.replace(/\s+/g, "").length;
    const pageCount = pdf.numPages;
    const avgCharsPerPage = textLength / pageCount;

    // Threshold: less than 100 chars per page suggests scanned
    // This accounts for page numbers, headers, etc.
    return avgCharsPerPage < 100;
  } catch (error) {
    // If extraction fails, assume scanned
    console.warn("[PDF Converter] Text extraction failed, assuming scanned:", error);
    return true;
  }
}

/**
 * Get PDF page count
 */
export async function getPDFPageCount(pdfBuffer: Buffer): Promise<number> {
  const { getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  return pdf.numPages;
}

/**
 * Extract text from a digital PDF
 * (Use this for PDFs that are NOT scanned)
 */
export async function extractPDFText(pdfBuffer: Buffer): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/**
 * Check if the canvas native module is usable.
 * pdf-img-convert depends on canvas, which crashes the process
 * with a symbol lookup error under Bun (native addon incompatibility).
 */
function isCanvasAvailable(): boolean {
  // Bun's runtime cannot load the canvas native addon — skip entirely
  if (typeof (globalThis as Record<string, unknown>).Bun !== "undefined") {
    return false
  }
  try {
    // Check if the .node file exists (doesn't load it)
    require.resolve("canvas")
    return true
  } catch {
    return false
  }
}

/**
 * Convert PDF pages to images
 *
 * Uses pdf-img-convert for PDF to image conversion.
 * This is needed for scanned PDFs that need OCR.
 */
export async function convertPDFToImages(
  pdfBuffer: Buffer,
  options: PDFConversionOptions = {}
): Promise<ConvertedPage[]> {
  const { dpi = 300, format = "png", pages, maxDimension = 3000 } = options;

  // Pre-check canvas availability to avoid fatal process crash
  if (!isCanvasAvailable()) {
    throw new Error("canvas native module is not available (Bun runtime detected) — cannot convert scanned PDF to images")
  }

  try {
    // Dynamic import to avoid issues if package not installed
    const pdfImgConvert = await import("pdf-img-convert");

    // Calculate scale from DPI (base PDF DPI is 72)
    const scale = dpi / 72;

    const conversionOptions: {
      scale: number;
      page_numbers?: number[];
    } = {
      scale,
    };

    if (pages && pages.length > 0) {
      conversionOptions.page_numbers = pages;
    }

    // Convert PDF to images
    const outputPages = await pdfImgConvert.convert(pdfBuffer, conversionOptions);

    const results: ConvertedPage[] = [];

    for (let i = 0; i < outputPages.length; i++) {
      const pageData = outputPages[i];

      // Convert Uint8Array to Buffer
      const imageBuffer = Buffer.from(pageData);

      // Get dimensions using sharp if available, otherwise estimate
      let width = 0;
      let height = 0;

      try {
        const sharp = await import("sharp");
        const metadata = await sharp.default(imageBuffer).metadata();
        width = metadata.width || 0;
        height = metadata.height || 0;

        // Resize if exceeds maxDimension
        if (maxDimension && (width > maxDimension || height > maxDimension)) {
          const resizedBuffer = await sharp
            .default(imageBuffer)
            .resize({
              width: maxDimension,
              height: maxDimension,
              fit: "inside",
              withoutEnlargement: true,
            })
            .toBuffer();

          const resizedMetadata = await sharp.default(resizedBuffer).metadata();

          results.push({
            pageNumber: pages ? pages[i] : i + 1,
            image: resizedBuffer,
            mimeType: format === "png" ? "image/png" : "image/jpeg",
            width: resizedMetadata.width || 0,
            height: resizedMetadata.height || 0,
          });
          continue;
        }
      } catch {
        // Sharp not available, use image as-is
        // Estimate dimensions from typical A4 at target DPI
        width = Math.round(8.5 * dpi);
        height = Math.round(11 * dpi);
      }

      results.push({
        pageNumber: pages ? pages[i] : i + 1,
        image: imageBuffer,
        mimeType: format === "png" ? "image/png" : "image/jpeg",
        width,
        height,
      });
    }

    return results;
  } catch (error) {
    // If pdf-img-convert is not installed, provide helpful error
    if (error instanceof Error && error.message.includes("Cannot find module")) {
      throw new Error(
        "PDF to image conversion requires 'pdf-img-convert' package. " +
          "Install it with: pnpm add pdf-img-convert"
      );
    }
    throw error;
  }
}

/**
 * Convert a single PDF page to image
 */
export async function convertPDFPageToImage(
  pdfBuffer: Buffer,
  pageNumber: number,
  options: PDFConversionOptions = {}
): Promise<ConvertedPage> {
  const results = await convertPDFToImages(pdfBuffer, {
    ...options,
    pages: [pageNumber],
  });

  if (results.length === 0) {
    throw new Error(`Page ${pageNumber} not found in PDF`);
  }

  return results[0];
}
