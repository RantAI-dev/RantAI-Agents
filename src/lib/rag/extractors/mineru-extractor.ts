import type { Extractor, ExtractionResult } from "./types";

/**
 * Client for the MinerU2.5-Pro extraction sidecar defined in
 * `services/mineru-server/server.py`. Posts the PDF as multipart form data and
 * receives markdown back.
 *
 * On OmniDocBench v1.6 MinerU2.5-Pro scores 95.69 — beats Gemini-3-Pro and
 * Qwen3-VL-235B on document tasks despite being 1.2B parameters. Preferred
 * extractor for on-prem deployments; usable in cloud mode too if a sidecar is
 * reachable.
 */
export class MineruExtractor implements Extractor {
  readonly name = "MineruExtractor";
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    if (!baseUrl) {
      throw new Error(
        "MineruExtractor requires a base URL — set KB_EXTRACT_MINERU_BASE_URL (e.g. http://localhost:8100)"
      );
    }
    // Normalize — accept with or without trailing slash or /extract
    this.baseUrl = baseUrl.replace(/\/+$/, "").replace(/\/extract$/, "");
  }

  async extract(pdfBuffer: Buffer): Promise<ExtractionResult> {
    const t0 = Date.now();
    const form = new FormData();
    // Copy into a standalone ArrayBuffer. Node's Buffer/Uint8Array parameterize
    // on ArrayBufferLike, but DOM's BlobPart demands ArrayBuffer specifically —
    // this slice produces the stricter type. Copies ~one page worth of bytes,
    // negligible vs. the multi-second extraction call.
    const ab = pdfBuffer.buffer.slice(
      pdfBuffer.byteOffset,
      pdfBuffer.byteOffset + pdfBuffer.byteLength,
    ) as ArrayBuffer;
    form.append(
      "file",
      new Blob([ab], { type: "application/pdf" }),
      "document.pdf"
    );

    const res = await fetch(`${this.baseUrl}/extract`, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `mineru sidecar ${res.status}: ${body.slice(0, 300)}`
      );
    }

    const data = (await res.json()) as {
      text: string;
      ms?: number;
      pages?: number;
    };

    return {
      text: data.text ?? "",
      ms: data.ms ?? Date.now() - t0,
      pages: data.pages,
      model: "mineru-2.5-pro",
    };
  }
}
