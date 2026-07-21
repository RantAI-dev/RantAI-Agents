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
    """Lazy-init — vLLM loads only when the first request arrives, not at import."""
    global _client
    if _client is not None:
        return _client
    from PIL import Image  # noqa: F401  (verify pillow present before vllm import)
    from vllm import LLM
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
    }
    if lp:
        kwargs["logits_processors"] = lp
    llm = LLM(**kwargs)
    _client = MinerUClient(backend="vllm-engine", vllm_llm=llm, image_analysis=False)
    return _client


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


def crop_figures(img, content_list, page_index):
    """Crop each figure/chart block from the page PNG using its normalized bbox,
    pairing the nearest caption below it. Returns list of figure dicts with a
    base64 PNG crop. bbox coords from MinerU are normalized [0,1]."""
    import base64
    figures = []
    W, H = img.size
    captions = [b for b in content_list if isinstance(b, dict) and b.get("type") in CAPTION_TYPES]
    for b in content_list:
        if not isinstance(b, dict) or b.get("type") not in FIGURE_TYPES:
            continue
        bbox = b.get("bbox")
        if not (isinstance(bbox, list) and len(bbox) == 4):
            continue
        x0, y0, x1, y1 = [max(0.0, min(1.0, float(c))) for c in bbox]
        px = (int(x0 * W), int(y0 * H), int(x1 * W), int(y1 * H))
        if px[2] - px[0] < 4 or px[3] - px[1] < 4:
            continue
        try:
            crop = img.crop(px)
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
            "type": b.get("type"),
            "page": page_index,
            "bbox": [x0, y0, x1, y1],
            "caption": cap,
            "image_b64": b64,
        })
    return figures


@app.post("/extract")
async def extract(
    file: UploadFile = File(...),
    dpi: int = Form(300),
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

    parts = []
    figures: list[dict] = []
    for page_index, png in enumerate(page_pngs):
        img = Image.open(io.BytesIO(png))
        try:
            content_list = client.two_step_extract(img)
            md = json2md(content_list)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"mineru inference failed: {e}")
        parts.append(md)
        if structured:
            try:
                figures.extend(crop_figures(img, list(content_list), page_index))
            except Exception as e:
                # Figures are best-effort — never fail the whole extraction over a crop.
                print(f"[mineru] figure crop failed on page {page_index}: {e}")

    text = "\n\n".join(parts)
    body = {
        "text": text,
        "ms": int((time.time() - t0) * 1000),
        "pages": len(page_pngs),
    }
    if structured:
        body["figures"] = figures
    return JSONResponse(body)
