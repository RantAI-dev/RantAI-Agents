# MinerU2.5-Pro extraction sidecar

Tiny FastAPI service that wraps `opendatalab/MinerU2.5-Pro-2604-1.2B` behind a
plain HTTP endpoint the Node KB pipeline can call. Lives out-of-process because
MinerU's client (`mineru_vl_utils.MinerUClient.two_step_extract`) runs a custom
two-pass inference with a logits processor that vLLM's stock OpenAI-compatible
endpoint does not expose.

## Setup

```bash
# Requires: Python 3.12, vLLM 0.11+, ghostscript, CUDA 12.6+ driver
source ~/vllm-env/bin/activate        # env with vllm + mineru-vl-utils already installed
pip install fastapi uvicorn[standard]

# Launch on GPU 0, port 8100
CUDA_VISIBLE_DEVICES=0 FLASHINFER_DISABLE_VERSION_CHECK=1 \
  uvicorn services.mineru-server.server:app --host 0.0.0.0 --port 8100
```

First request triggers model load (~30 s warm, ~210 s cold). Subsequent requests
hit the hot vLLM engine at ~1-4 s per page.

## Point the KB pipeline at it

```
KB_EXTRACT_PRIMARY="mineru"
KB_EXTRACT_MINERU_BASE_URL="http://localhost:8100"
```

`KB_EXTRACT_PRIMARY=mineru` is a sentinel the TS code looks for. When set, the
Node pipeline sends PDFs to `{KB_EXTRACT_MINERU_BASE_URL}/extract` as multipart
form data instead of hitting OpenRouter.

## API

```
POST /extract
  multipart field `file`: PDF or image
  optional `dpi`: int (default 300, only used for PDFs)
→ 200 { "text": "...", "ms": 1234, "pages": 1 }
→ 4xx/5xx { "error": "..." }
```

```
GET /health
→ { "status": "ok", "model": "...", "loaded": true/false }
```

## Env

| var | default | notes |
|---|---|---|
| `MINERU_MODEL` | `opendatalab/MinerU2.5-Pro-2604-1.2B` | override only if you host a fine-tune |
| `MINERU_MAX_TOKENS` | `8192` | model's max_position_embeddings |
| `MINERU_MEM_UTIL` | `0.25` | fraction of GPU memory to reserve |
