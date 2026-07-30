import http from "node:http";
import https from "node:https";
import { URL } from "node:url";
import type { Extractor, ExtractionResult, ExtractedFigure } from "./types";

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

  async extract(pdfBuffer: Buffer, opts?: { withFigures?: boolean }): Promise<ExtractionResult> {
    const t0 = Date.now();

    // Build the multipart body by hand and POST it via node:http rather than fetch.
    // mineru does per-block VLM OCR synchronously and only sends response headers
    // once the whole document is parsed. Node's global fetch (undici) enforces a
    // 300s headersTimeout that can't be raised per-request without importing undici
    // (not a dependency here), so dense/large books that take longer were aborted
    // with "The operation timed out" and fell back to text — silently losing all
    // figures/tables. node:http has no headers cap; we set an explicit inactivity
    // timeout via KB_EXTRACT_MINERU_TIMEOUT_MS (default 20 min).
    const timeoutMs = Number(process.env.KB_EXTRACT_MINERU_TIMEOUT_MS) || 20 * 60 * 1000;
    const boundary = `----mineru${Date.now().toString(36)}${Math.round(Date.now() % 1e6)}`;
    const CRLF = "\r\n";
    const head = Buffer.from(
      `--${boundary}${CRLF}` +
        `Content-Disposition: form-data; name="file"; filename="document.pdf"${CRLF}` +
        `Content-Type: application/pdf${CRLF}${CRLF}`,
    );
    const structuredPart = opts?.withFigures
      ? Buffer.from(
          `${CRLF}--${boundary}${CRLF}` +
            `Content-Disposition: form-data; name="structured"${CRLF}${CRLF}true`,
        )
      : Buffer.alloc(0);
    const tail = Buffer.from(`${CRLF}--${boundary}--${CRLF}`);
    const body = Buffer.concat([head, pdfBuffer, structuredPart, tail]);

    const url = new URL(`${this.baseUrl}/extract`);
    const transport = url.protocol === "https:" ? https : http;

    const { status, text: responseText } = await new Promise<{
      status: number;
      text: string;
    }>((resolve, reject) => {
      const req = transport.request(
        url,
        {
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (c: Buffer) => chunks.push(c));
          res.on("end", () =>
            resolve({
              status: res.statusCode ?? 0,
              text: Buffer.concat(chunks).toString("utf-8"),
            }),
          );
        },
      );
      // Inactivity timeout: fires only if no socket activity for timeoutMs.
      req.setTimeout(timeoutMs, () => {
        req.destroy(new Error(`mineru sidecar timeout after ${timeoutMs}ms`));
      });
      req.on("error", reject);
      req.end(body);
    });

    if (status < 200 || status >= 300) {
      throw new Error(`mineru sidecar ${status}: ${responseText.slice(0, 300)}`);
    }

    const data = JSON.parse(responseText) as {
      text: string;
      ms?: number;
      pages?: number;
      /** Per-page markdown (parts[page]) — lets us tag text chunks + figures with
       *  their source page. Sidecar server.py emits this alongside `text`. */
      pages_text?: string[];
      figures?: Array<{
        type: string;
        page: number;
        bbox: [number, number, number, number];
        caption: string | null;
        image_b64: string;
      }>;
    };

    const figures: ExtractedFigure[] | undefined = data.figures?.map((f) => ({
      type: f.type,
      page: f.page,
      bbox: f.bbox,
      caption: f.caption,
      imageBase64: f.image_b64,
    }));

    // Build a pageMap from the per-page text so text chunks get "hal. N" and
    // caption-less figures can borrow their page's prose (figure-assets.ts).
    const pageMap = data.pages_text?.length
      ? data.pages_text.map((text, page) => ({ page, text }))
      : undefined;

    return {
      text: data.text ?? "",
      ms: data.ms ?? Date.now() - t0,
      pages: data.pages,
      model: "mineru-2.5-pro",
      ...(figures ? { figures } : {}),
      ...(pageMap ? { pageMap } : {}),
    };
  }
}
