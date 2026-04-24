# services/rerank-server

Self-hosted cross-encoder rerank sidecar. Default model: `nvidia/llama-nemotron-rerank-1b-v2` (~2.5 GB VRAM in BF16). Wraps `transformers.AutoModelForSequenceClassification` in a tiny FastAPI app that exposes a Cohere-shaped `POST /rerank` so the platform's `VllmReranker` can hit it as a drop-in.

Why this exists: serving Nemotron via the official vLLM container needs ~12 GB of disk for the image. This sidecar reuses an existing local Python venv and loads the model directly — same protocol as vLLM's `/rerank`, no Docker pull.

## Bench reference

On the 2026-04-24 SciFact bench (1500 docs, 300 queries, single A6000):

| Reranker | hit@1 | nDCG@10 | ms/query | $/query |
|---|---|---|---|---|
| no-rerank | 0.770 | 0.854 | 0 | $0 |
| **nemotron-rerank-1b-v2 (this sidecar)** | **0.797** | **0.874** | **265** | **$0** |
| cohere/rerank-4-pro | 0.807 | 0.876 | 682 | $0.002 |
| llm:gemini-3-flash-preview | 0.787 | 0.874 | 1751 | ~$0.006 |

Within 1 pt of Cohere v4-pro on hit@1, ties nDCG, 2.6× faster than Cohere, free at runtime. Full bench: `docs/artifact-plans/reranker-bench-2026-04-24.md`.

## Run

```bash
cd services/rerank-server
CUDA_VISIBLE_DEVICES=1 ~/vllm-env/bin/uvicorn server:app --host 0.0.0.0 --port 8200
```

First request: ~30s download (HF cache) + 5s GPU load. After that, ~265ms/query for top-20 candidates.

## Wiring into the platform

```bash
# .env
KB_RERANK_ENABLED=true
KB_RERANK_PROVIDER=vllm
KB_RERANK_BASE_URL=http://localhost:8200      # default; override for remote sidecar
KB_RERANK_MODEL=nvidia/llama-nemotron-rerank-1b-v2  # passed through to logging
```

`getDefaultReranker()` in `src/lib/rag/rerankers/index.ts` reads these and returns a `VllmReranker` instance.

## Env vars accepted by the sidecar itself

| Env | Default | Purpose |
|-----|---------|---------|
| `RERANK_MODEL` | `nvidia/llama-nemotron-rerank-1b-v2` | HF model id |
| `RERANK_MAX_LENGTH` | `512` | Tokenizer truncation |
| `RERANK_BATCH` | `16` | Max query+passage pairs per forward pass |

## Protocol

```
POST /rerank
  { "model": "...", "query": "...", "documents": ["...", "..."], "top_n": 5 }
→ 200 { "results": [{ "index": 2, "relevance_score": 12.5 }, ...] }

GET /health
→ 200 { "ok": true, "model": "...", "device": "cuda:0" }
```

Matches Cohere `POST /v2/rerank` response shape, so any client built for that API works against this sidecar.
