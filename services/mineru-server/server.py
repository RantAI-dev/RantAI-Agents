"""Thin HTTP wrapper around opendatalab/MinerU2.5-Pro-2604-1.2B.

Exposes `POST /extract` that the Node KB pipeline calls. Reason for this sidecar:
MinerU's `MinerUClient.two_step_extract()` runs a layout pass then per-block
OCR with a custom logits processor. vLLM's stock OpenAI-compatible endpoint
doesn't expose that flow, so we wrap `MinerUClient` directly in a tiny FastAPI
process.

Launch:
    source ~/vllm-env/bin/activate
    CUDA_VISIBLE_DEVICES=0 FLASHINFER_DISABLE_VERSION_CHECK=1 \
      uvicorn services.mineru_server.server:app --host 0.0.0.0 --port 8100

Env:
    MINERU_MODEL       default "opendatalab/MinerU2.5-Pro-2604-1.2B"
    MINERU_MAX_TOKENS  default 8192 (= model's max_position_embeddings)
    MINERU_MEM_UTIL    default 0.25 (fraction of GPU memory reserved)

Protocol:
    POST /extract
      multipart field `file`: PDF or image (jpg/png)
      optional field `dpi`: int — render DPI if PDF (default 300)
    Response:
      200 { "text": "...", "ms": 1234, "pages": 1 }
      400 { "error": "..." }
"""
import io
import os
import subprocess
import tempfile
import time
from pathlib import Path

from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.responses import JSONResponse

MODEL = os.environ.get("MINERU_MODEL", "opendatalab/MinerU2.5-Pro-2604-1.2B")
MAX_TOKENS = int(os.environ.get("MINERU_MAX_TOKENS", "8192"))
MEM_UTIL = float(os.environ.get("MINERU_MEM_UTIL", "0.25"))

app = FastAPI(title="MinerU2.5-Pro extraction service")

_client = None


def get_client():
    """Lazy-init — vLLM loads only when the first request arrives, not at import.

    Uses vLLM's **async** engine + MinerUClient(backend="vllm-async-engine"). This
    is the throughput-critical part: the async engine lets us submit every page of
    a document to vLLM at once (see /extract's aio_batch_two_step_extract), so
    vLLM batches the Stage-I layout passes and Stage-II per-block OCR passes across
    all pages and keeps the GPU saturated. The old sync `vllm-engine` backend +
    per-page loop fed vLLM a batch size of 1, starving the GPU and running ~30-60x
    slower (MinerU2.5 targets ~2 pages/s on A100; the sync loop got ~1 page/30s).
    """
    global _client
    if _client is not None:
        return _client
    from PIL import Image  # noqa: F401  (verify pillow present before vllm import)
    from vllm.v1.engine.async_llm import AsyncLLM
    from vllm.engine.arg_utils import AsyncEngineArgs
    from mineru_vl_utils import MinerUClient
    try:
        from mineru_vl_utils import MinerULogitsProcessor
        lp = [MinerULogitsProcessor]
    except ImportError:
        lp = None

    kwargs = {
        "model": MODEL,
        "dtype": "bfloat16",
        "max_model_len": MAX_TOKENS,
        "gpu_memory_utilization": MEM_UTIL,
        # MinerU2.5 ties lm_head to the token embeddings, so the checkpoint ships
        # no separate lm_head.weight. The vllm/vllm-openai:cu130-nightly build's
        # Qwen2VL loader doesn't honour the config's tie flag and aborts with
        # "Following weights were not initialized from checkpoint:
        # {'language_model.lm_head.weight'}" -> EngineCore init fails -> every
        # /extract returns 500. Forcing the tie via hf_overrides makes the loader
        # reuse the embedding weights for the head. Remove once the base image
        # ships a vLLM that handles the tie natively.
        "hf_overrides": {"tie_word_embeddings": True},
    }
    if lp:
        kwargs["logits_processors"] = lp
    async_llm = AsyncLLM.from_engine_args(AsyncEngineArgs(**kwargs))
    _client = MinerUClient(
        backend="vllm-async-engine", vllm_async_llm=async_llm, image_analysis=False
    )
    return _client


async def extract_pages(client, images):
    """Run two-step extraction over every page concurrently.

    Prefer the client's batch helper; fall back to asyncio.gather over the
    per-image async method (both feed vLLM concurrent requests it can batch)."""
    import asyncio
    batch = getattr(client, "aio_batch_two_step_extract", None)
    if batch is not None:
        return await batch(images)
    return await asyncio.gather(*(client.aio_two_step_extract(img) for img in images))


def render_pdf_pages(pdf_bytes: bytes, dpi: int) -> list[bytes]:
    """Ghostscript per-page PNG render. Returns one PNG per page."""
    with tempfile.TemporaryDirectory(prefix="mineru-render-") as tmp:
        tmp_path = Path(tmp)
        in_pdf = tmp_path / "in.pdf"
        in_pdf.write_bytes(pdf_bytes)
        out_pattern = str(tmp_path / "page-%d.png")
        res = subprocess.run(
            ["gs", "-q", "-dNOPAUSE", "-dBATCH", "-sDEVICE=png16m",
             f"-r{dpi}", f"-sOutputFile={out_pattern}", str(in_pdf)],
            capture_output=True, timeout=120,
        )
        if res.returncode != 0:
            raise RuntimeError(f"ghostscript failed: {res.stderr[:200]!r}")
        pngs = sorted(tmp_path.glob("page-*.png"), key=lambda p: int(p.stem.split("-")[1]))
        return [p.read_bytes() for p in pngs]


@app.get("/health")
def health():
    return {"status": "ok", "model": MODEL, "loaded": _client is not None}


# Block types that are croppable visual figures (multimodal RAG fase 2).
FIGURE_TYPES = {"image", "chart", "image_block"}
CAPTION_TYPES = {"image_caption", "image_footnote", "table_caption", "table_footnote"}

# Noise filters (fraction of page area, normalized bbox). Curriculum books are
# full of ornamental crops that pollute chat: tiny clip-art icons, and near-full
# -page "images" where MinerU boxed the whole page instead of a figure. Skip both.
FIGURE_MIN_AREA = float(os.environ.get("MINERU_FIG_MIN_AREA", "0.006"))  # tiny icons
FIGURE_MAX_AREA = float(os.environ.get("MINERU_FIG_MAX_AREA", "0.50"))   # whole-page crops
# MinerU boxes bordered worksheet/form regions and whole content areas as "image"
# blocks — page screenshots full of text, not real figures. Real illustrations
# (photos, maps, colored diagrams) are visually colorful; text/forms/pages are
# mostly white + thin borders. Skip crops whose colorful-pixel fraction is below
# this (measured on a 64x64 downscale). Tunable via MINERU_FIG_MIN_COLORFUL.
FIGURE_MIN_COLORFUL = float(os.environ.get("MINERU_FIG_MIN_COLORFUL", "0.15"))
# A real figure crop contains at most a caption; a "page region" crop (figure
# plus the surrounding paragraphs, or a whole worksheet page) swallows many text
# blocks. Skip a crop whose bbox contains more than this many text blocks — this
# is what catches colorful whole-page crops that area/colorfulness let through.
FIGURE_MAX_TEXT_INSIDE = int(os.environ.get("MINERU_FIG_MAX_TEXT_INSIDE", "3"))
TEXT_TYPES = {"text", "title", "list", "footnote", "footer", "page_number", "index"}


def _text_blocks_inside(fig_bbox, text_boxes):
    """Count text blocks whose center falls inside the figure bbox."""
    fx0, fy0, fx1, fy1 = fig_bbox
    n = 0
    for tb in text_boxes:
        cx = (tb[0] + tb[2]) / 2
        cy = (tb[1] + tb[3]) / 2
        if fx0 <= cx <= fx1 and fy0 <= cy <= fy1:
            n += 1
    return n


def _colorful_frac(crop):
    im = crop.convert("RGB").resize((64, 64))
    px = list(im.getdata())
    colorful = 0
    for r, g, b in px:
        mx = max(r, g, b)
        mn = min(r, g, b)
        if mx > 245 and mn > 235:  # near-white background
            continue
        if mx - mn > 40:  # saturated / colored pixel
            colorful += 1
    return colorful / len(px) if px else 0.0
# Decorative templates (chapter-marker circles "Pembelajaran N", "Ayo Berpikir"
# thought bubbles) repeat near-identically across a book. Drop any crop that has
# more than this many near-duplicates (avg-hash within Hamming 5) in the document.
FIGURE_REPEAT_MAX = int(os.environ.get("MINERU_FIG_REPEAT_MAX", "3"))


def _ahash(crop):
    """8x8 average hash — coarse enough that a repeated template (differing only
    in a small detail like a chapter number) still collides within a few bits."""
    g = crop.convert("L").resize((8, 8))
    px = list(g.getdata())
    avg = sum(px) / len(px) if px else 0
    bits = 0
    for i, p in enumerate(px):
        if p >= avg:
            bits |= (1 << i)
    return bits


def _hamming(a, b):
    return bin(a ^ b).count("1")


def drop_repeated_figures(figures):
    """Remove decorative templates: crops whose avg-hash has > FIGURE_REPEAT_MAX
    near-duplicates across the document. Unique content figures survive."""
    if not figures:
        return figures
    kept = []
    for f in figures:
        h = f.get("_ahash")
        dupes = sum(1 for g in figures if h is not None and _hamming(h, g.get("_ahash", 0)) <= 5)
        if dupes <= FIGURE_REPEAT_MAX:
            kept.append(f)
    for f in kept:
        f.pop("_ahash", None)
    return kept  # note: "id"/"block_index" survive — pages_blocks depends on them


def crop_figures(img, content_list, page_index):
    """Crop each figure/chart block from the page PNG using its normalized bbox,
    pairing the nearest caption below it. Returns list of figure dicts with a
    base64 PNG crop. bbox coords from MinerU are normalized [0,1]."""
    import base64
    figures = []
    W, H = img.size
    captions = [b for b in content_list if isinstance(b, dict) and b.get("type") in CAPTION_TYPES]
    text_boxes = [
        b["bbox"] for b in content_list
        if isinstance(b, dict) and b.get("type") in TEXT_TYPES
        and isinstance(b.get("bbox"), list) and len(b["bbox"]) == 4
    ]
    for block_index, b in enumerate(content_list):
        if not isinstance(b, dict) or b.get("type") not in FIGURE_TYPES:
            continue
        bbox = b.get("bbox")
        if not (isinstance(bbox, list) and len(bbox) == 4):
            continue
        x0, y0, x1, y1 = [max(0.0, min(1.0, float(c))) for c in bbox]
        px = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))
        if px[2] - px[0] < 4 or px[3] - px[1] < 4:
            continue
        # Skip ornamental tiny icons and whole-page "images" (see FIGURE_*_AREA).
        area = (x1 - x0) * (y1 - y0)
        if area < FIGURE_MIN_AREA or area > FIGURE_MAX_AREA:
            continue
        # Skip page-region crops that swallow the surrounding paragraphs.
        if _text_blocks_inside((x0, y0, x1, y1), text_boxes) > FIGURE_MAX_TEXT_INSIDE:
            continue
        try:
            crop = img.crop(px)
            # Skip text/form/whole-page crops (mostly white, not real figures).
            if _colorful_frac(crop) < FIGURE_MIN_COLORFUL:
                continue
            ahash = _ahash(crop)
            buf = io.BytesIO()
            crop.convert("RGB").save(buf, format="PNG")
            b64 = base64.b64encode(buf.getvalue()).decode()
        except Exception:
            continue
        # Nearest caption whose top is just below the figure (same page).
        cap = None
        best = 1e9
        for c in captions:
            cb = c.get("bbox")
            if not (isinstance(cb, list) and len(cb) == 4):
                continue
            gap = cb[1] - y1
            if -0.05 <= gap < best:
                best, cap = gap, (c.get("content") or "").strip() or None
        figures.append({
            # Stable, page-unique handle. The same id is emitted inline in
            # `pages_blocks`, which is what lets the consumer place the figure
            # back where the document actually put it.
            "id": f"p{page_index}-b{block_index}",
            # Position of this figure among the page's blocks, in reading order.
            # Without it the figure is just "somewhere on page N" and the
            # consumer has to re-guess placement from captions at query time.
            "block_index": block_index,
            "type": b.get("type"),
            "page": page_index,
            "bbox": [x0, y0, x1, y1],
            "caption": cap,
            "image_b64": b64,
            "_ahash": ahash,
        })
    return figures


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    dpi: int = Form(180),
    structured: bool = Form(False),
):
    from PIL import Image
    from mineru_vl_utils.post_process import json2md

    t0 = time.time()
    client = get_client()

    raw = await file.read()
    ct = (file.content_type or "").lower()
    name = (file.filename or "").lower()

    page_pngs: list[bytes]
    if ct.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg")):
        page_pngs = [raw]
    elif ct == "application/pdf" or name.endswith(".pdf"):
        try:
            page_pngs = render_pdf_pages(raw, dpi)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"pdf render failed: {e}")
    else:
        raise HTTPException(status_code=400, detail=f"unsupported content-type: {ct}")

    imgs = [Image.open(io.BytesIO(png)) for png in page_pngs]
    try:
        # All pages submitted at once -> vLLM batches them across the GPU.
        content_lists = await extract_pages(client, imgs)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"mineru inference failed: {e}")

    parts = []
    figures: list[dict] = []
    # Raw per-page block sequences, kept so we can emit reading-order blocks
    # below. content_lists is consumed twice, so materialize each page's list.
    page_blocks_src: list[list] = []
    for page_index, (img, content_list) in enumerate(zip(imgs, content_lists)):
        cl = list(content_list)
        page_blocks_src.append(cl)
        parts.append(json2md(cl))
        if structured:
            try:
                figures.extend(crop_figures(img, cl, page_index))
            except Exception as e:
                # Figures are best-effort — never fail the whole extraction over a crop.
                print(f"[mineru] figure crop failed on page {page_index}: {e}")

    if structured:
        n_before = len(figures)
        figures = drop_repeated_figures(figures)
        if n_before != len(figures):
            print(f"[mineru] dropped {n_before - len(figures)} repeated/decorative figures")

    text = "\n\n".join(parts)
    body = {
        "text": text,
        "ms": int((time.time() - t0) * 1000),
        "pages": len(page_pngs),
        # Per-page markdown so the Node side can tag text chunks + figures with
        # their source page (sources show "hal. N", figures borrow page context).
        "pages_text": parts,
    }
    if structured:
        body["figures"] = figures
        # Reading-order block sequence per page, with each surviving figure
        # emitted INLINE at its own position.
        #
        # This is the field that makes on-prem extraction anchor-capable. Until
        # now the response handed back prose and figures as two disjoint arrays,
        # discarding the one fact the layout model already knew: where in the
        # text each figure sits. The consumer was then forced to reconstruct
        # placement from caption keywords at query time — unreliable, because
        # curriculum books mostly print no captions at all.
        #
        # Emitted alongside (not instead of) `text`/`pages_text`, so every
        # existing consumer is unaffected.
        kept_ids = {f["id"] for f in figures if "id" in f}
        pages_blocks = []
        for page_index, cl in enumerate(page_blocks_src):
            blocks = []
            for block_index, b in enumerate(cl):
                if not isinstance(b, dict):
                    continue
                btype = b.get("type")
                fid = f"p{page_index}-b{block_index}"
                if btype in FIGURE_TYPES:
                    # Only figures that survived cropping/dedup: a dropped
                    # ornament must not leave a dangling anchor behind.
                    if fid in kept_ids:
                        blocks.append({"kind": "figure", "id": fid})
                elif btype in TEXT_TYPES or btype in CAPTION_TYPES:
                    txt = (b.get("content") or b.get("text") or "").strip()
                    if txt:
                        # Carry MinerU's OWN block type through.
                        #
                        # The first version of this collapsed title / list /
                        # footnote / footer / page_number / index into a single
                        # "text" kind and dropped caption blocks entirely — the
                        # same discard this whole change exists to stop, one
                        # layer down. It costs the consumer three things it
                        # cannot recover afterwards:
                        #   - page numbers and running footers get chunked as if
                        #     they were content, polluting the embeddings
                        #   - headings become invisible, so chunks cannot be cut
                        #     at section boundaries and split mid-topic instead
                        #   - captions vanish from the reading order
                        # All three degrade retrieval, which is the measured
                        # bottleneck (only ~52% of questions retrieve the chunk
                        # holding their figure at all).
                        blocks.append(
                            {
                                "kind": "caption" if btype in CAPTION_TYPES else "text",
                                "type": btype,
                                "text": txt,
                            }
                        )
            pages_blocks.append(blocks)
        body["pages_blocks"] = pages_blocks
    return JSONResponse(body)
