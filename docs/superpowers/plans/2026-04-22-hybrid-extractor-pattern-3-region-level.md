# Hybrid Extractor — Pattern 3 (Region-Level Hybrid)

**Status:** DEFERRED. Pattern 2 (parallel-run + prose-span substitution) was
shipped on 2026-04-22 as `HybridExtractor`. Pattern 3 is retained here as a
future optimization to revisit when ingest volumes justify it.

**When to revisit:** If daily ingest exceeds ~50K pages AND ≥70% of the corpus
is structure-light (memos, articles, e-books), the extra latency saved by
skipping full-page MinerU inference on prose regions becomes material. At lower
volumes, Pattern 2's simplicity is the correct trade-off.

---

## What Pattern 3 is

Rather than running MinerU on the entire page image and then overlaying unpdf
text on prose blocks (Pattern 2), Pattern 3 uses MinerU only where it is
actually needed — table regions, formula regions, complex multi-column
regions — and uses unpdf for everything else via bbox-to-character mapping.

```
PDF page
   ↓
1. Layout-detection pass (MinerU step 1 only)
   → regions with bboxes + region types (prose / table / formula / image)
   ↓
2. For each region:
   ├─ prose region    → pull text from unpdf using bbox coordinates
   ├─ table region    → MinerU full inference (crop, run two_step_extract)
   ├─ formula region  → MinerU full inference (crop)
   └─ image/figure    → caption via MinerU; image bytes sidecar'd
   ↓
3. Reassemble in original reading order
```

## Why defer

1. **MinerU's internal API is not exposed for per-region calls.** The current
   `MinerUClient.two_step_extract(Image)` takes a whole page; there is no
   documented API to request only layout detection or to run step 2 on a
   pre-cropped image. We would need to either (a) subclass MinerUClient and
   introspect its vllm prompts, or (b) add a second FastAPI endpoint that
   returns raw layout JSON.

2. **Bbox-to-character mapping requires a separate tool.** unpdf exposes
   `extractText` with page-level text but not character-level positions. To map
   bboxes to characters, we need `pdfium2`, `pdfplumber`, or direct
   pdfjs-dist access. Another dependency, another failure surface.

3. **Pattern 2 is already at 99% of the theoretical gain.** Empirical benches
   today on MinerU2.5-Pro show character-level accuracy of 4/4 to 5/5 on test
   pages — the errors Pattern 2 catches are edge cases, not a systemic gap.
   Pattern 3's advantage is mostly about *speed on prose-heavy corpora*, not
   *quality*.

4. **The failure surface is larger.** Pattern 3 introduces region-boundary edge
   cases: floats, footnotes that cross regions, reading-order ambiguity when
   layout detection is imperfect. Each of those needs test coverage that
   Pattern 2 gets for free by deferring to MinerU's already-tested layout
   understanding.

## Concrete implementation sketch (for future use)

### New extractor

```typescript
// src/lib/rag/extractors/region-hybrid-extractor.ts
class RegionHybridExtractor implements Extractor {
  constructor(
    private layoutClient: MineruLayoutClient,   // NEW sidecar endpoint
    private textLayerReader: PdfTextReader,     // NEW, bbox-aware unpdf wrapper
    private mineruFullClient: MineruClient,     // existing MineruExtractor
  ) {}

  async extract(pdf: Buffer): Promise<ExtractionResult> {
    const pagePngs = await renderToPngs(pdf, { dpi: 300 });
    const pageResults = await Promise.all(
      pagePngs.map(async (png, pageIdx) => {
        const regions = await this.layoutClient.detect(png);  // bboxes + labels
        const parts = await Promise.all(regions.map(async r => {
          if (r.kind === "prose") {
            return this.textLayerReader.textForBbox(pdf, pageIdx, r.bbox);
          }
          if (r.kind === "table" || r.kind === "formula") {
            const cropped = await cropPng(png, r.bbox);
            return this.mineruFullClient.extractFromImage(cropped);
          }
          if (r.kind === "figure") {
            // Figures get captioned by MinerU, image bytes attached as artifact
            return await this.mineruFullClient.captionImage(png, r.bbox);
          }
          return "";
        }));
        return parts.join("\n\n");
      }),
    );
    return { text: pageResults.join("\n\n---\n\n"), /* ... */ };
  }
}
```

### New sidecar endpoint

```python
# services/mineru-server/server.py
@app.post("/layout")
async def layout(file: UploadFile):
    """Run only the layout-detection pass. Returns a list of region bboxes
    with type labels. Cheaper than /extract because step-2 OCR is skipped."""
    img = Image.open(io.BytesIO(await file.read()))
    regions = get_client().detect_layout(img)  # requires subclassing MinerUClient
    return [{"kind": r.label, "bbox": r.bbox} for r in regions]
```

### New text-layer reader

```typescript
// src/lib/rag/extractors/pdf-bbox-reader.ts
export class PdfBboxReader {
  async textForBbox(pdf: Buffer, pageIdx: number, bbox: [number, number, number, number]): Promise<string> {
    // Use pdfium2 / pdfjs-dist to extract text whose character bboxes fall inside `bbox`.
    // Return in reading order (left-to-right, top-to-bottom within bbox).
  }
}
```

## Expected gain when shipped

Assuming a corpus where 80% of page area is prose:

| Metric | Pattern 2 (shipped) | Pattern 3 (this plan) |
|---|---|---|
| Wall-clock / page (structural extractor bound) | ~4 s | ~1–2 s |
| GPU utilization | 100% of MinerU cycles per page | ~20% of MinerU cycles per page |
| Text fidelity on prose | char-perfect (unpdf) | char-perfect (unpdf) |
| Table / formula fidelity | MinerU | MinerU |
| Code complexity (LoC) | ~200 | ~600 |
| Tests needed | ~10 | ~30 (bbox alignment, reading order, figure handling) |

Pattern 3 is ~2-3× faster on prose-heavy corpora and ~5× cheaper in GPU
utilization, at the cost of 3× the code and test surface. The trade makes
sense only at scale.

## Preconditions for shipping Pattern 3

Ship this when ALL of the following are true:
1. Production ingest exceeds 50K pages/day AND ingest latency is a bottleneck
2. MinerU-Pro layout API is exposed for per-region calls (either upstream or
   via our own subclass of `MinerUClient`)
3. A bbox-aware text extractor (pdfium2 bindings or similar) is integrated
4. Benchmark shows Pattern 2's per-page latency is the actual bottleneck (not
   network, not embedding, not storage I/O)

Until then, Pattern 2 is the right stopping point.

## Alternative to consider before Pattern 3

Before implementing Pattern 3, evaluate:
- **Pre-filter at the document level**: detect whether a PDF contains any
  tables/formulas at all. If not, skip MinerU entirely and use unpdf alone.
  This is ~20 LoC vs Pattern 3's ~600 and captures 60-70% of Pattern 3's
  speedup on mixed corpora.
- **Chunk-level selective invocation**: run unpdf for the whole doc, detect
  which chunks look like tables (high-digit density, pipe characters, tabular
  spacing), re-extract only those chunks with MinerU. Simpler than region
  bboxes but still targets compute at the structural regions.

Either of these alternatives should be shipped and measured before committing
to the full Pattern 3 plan above.
