# On-prem deployment — client with 4× H200 stack

Concrete recipe for deploying RantAI-Agents fully air-gapped on a client with:
- **4× NVIDIA H200** (141 GB each, 564 GB total)
- **Target**: 1200 concurrent chat users + KB ingest for ~5K pages/day
- **Client-provided models**: Gemma 4 26B A4B, Qwen3-Embedding-8B, NuExtract 2B
- **Added by us**: Qwen3-VL-30B-A3B (PDF extraction) — see rationale in `KB_VISION_MODEL_BENCHMARKS.md`

Zero external API calls. All env vars already supported by the codebase (Phase 8 shipped `KB_EXTRACT_VISION_BASE_URL`, `KB_EMBEDDING_BASE_URL`, `WEB_SEARCH_MODE=local`).

---

## Why Qwen3-VL-30B-A3B is added to the stack

Measured empirically on OpenRouter (see `KB_VISION_MODEL_BENCHMARKS.md`):

| Model | PDF input support | Structural output |
|---|---|---|
| **Gemma 4 26B A4B** | ❌ Returns 0 chars or times out on PDF `file` content-type. It's image-only (same failure mode as Llama-3.2-Vision). | — |
| **Qwen3-VL-30B-A3B** | ✅ Native PDF support in vLLM ≥ 0.11 | 4.8s, 8 headings, 125 table rows on apple10k — matches Gemini-3-Flash |

Gemma 4 is excellent for chat/rerank/reasoning but **cannot do our extraction job**. Qwen3-VL fills that gap.

---

## GPU layout

```
┌────────────────────┬────────────────────────────────────────────────────┐
│ GPU 0 + GPU 1 (TP) │ Gemma 4 26B A4B FP8                                │
│ 282 GB             │ Chat, rerank, Contextual Retrieval, query expand   │
│                    │ ~52 GB weights + ~230 GB KV → ~1000 concurrent     │
├────────────────────┼────────────────────────────────────────────────────┤
│ GPU 2              │ Qwen3-VL-30B-A3B-Instruct FP8                      │
│ 141 GB             │ PDF / image extraction ONLY                         │
│                    │ ~20 GB weights + ~120 GB KV/batch for ingest       │
├────────────────────┼────────────────────────────────────────────────────┤
│ GPU 3              │ Qwen3-Embedding-8B (TEI) + NuExtract-2B            │
│ 141 GB             │ Embeddings + document classification                │
│                    │ ~10 GB weights total + giant batch budget          │
└────────────────────┴────────────────────────────────────────────────────┘
```

Ingest throughput demand at 5K pages/day: 0.06 pages/sec — trivial for the dedicated Qwen3-VL instance. The pressure point is chat KV cache on GPU 0-1; monitor `--max-model-len` and `--max-num-seqs`.

---

## Services to run

| Service | Image / source | Port | Purpose |
|---|---|---|---|
| **vllm-gemma** | `vllm/vllm-openai:latest` | `8000` | chat / rerank / CR / QE |
| **vllm-qwen-vl** | `vllm/vllm-openai:latest` | `8001` | PDF extraction |
| **tei-embedding** | `ghcr.io/huggingface/text-embeddings-inference:latest` | `8080` | embeddings |
| **vllm-nuextract** | `vllm/vllm-openai:latest` | `8002` | doc classification |
| **searxng** | `searxng/searxng:latest` | `8888` | web search (air-gapped) |
| **postgres** | `postgres:16` | `5432` | document metadata |
| **surrealdb** | `surrealdb/surrealdb:latest` | `8788` | vector + BM25 |
| **rustfs** | `rustfs/rustfs:latest` | `9000` | S3-compat file storage |
| **rantai-app** | this repo | `3000` | the platform itself |

---

## vLLM / TEI startup commands

### Gemma 4 26B A4B — chat + rerank + CR + QE

```bash
# On the host with GPU 0-1 visible
CUDA_VISIBLE_DEVICES=0,1 \
  vllm serve google/gemma-4-26b-a4b-it \
    --served-model-name gemma-4-26b-a4b \
    --tensor-parallel-size 2 \
    --quantization fp8 \
    --max-model-len 32768 \
    --max-num-seqs 256 \
    --gpu-memory-utilization 0.92 \
    --host 0.0.0.0 --port 8000
```

### Qwen3-VL-30B-A3B — PDF extraction

```bash
CUDA_VISIBLE_DEVICES=2 \
  vllm serve Qwen/Qwen3-VL-30B-A3B-Instruct-FP8 \
    --served-model-name qwen3-vl-30b-a3b \
    --quantization fp8 \
    --max-model-len 65536 \
    --max-num-seqs 32 \
    --gpu-memory-utilization 0.90 \
    --limit-mm-per-prompt image=10 \
    --host 0.0.0.0 --port 8001
```

Requires vLLM ≥ 0.11 for Qwen3-VL support.

### Qwen3-Embedding-8B — embeddings

```bash
CUDA_VISIBLE_DEVICES=3 \
  text-embeddings-router \
    --model-id Qwen/Qwen3-Embedding-8B \
    --dtype float16 \
    --max-batch-tokens 32768 \
    --max-concurrent-requests 512 \
    --hostname 0.0.0.0 --port 8080
```

TEI exposes **`/embed`** (not `/embeddings`). This is handled by setting `KB_EMBEDDING_BASE_URL=http://tei:8080/embed` in the app's env.

### NuExtract 2B — doc classification

NuExtract is a fine-tuned Qwen2.5-VL; vLLM serves it with the normal chat-completions endpoint.

```bash
CUDA_VISIBLE_DEVICES=3 \
  vllm serve numind/NuExtract-2.0-2B \
    --served-model-name nuextract-2b \
    --dtype float16 \
    --max-model-len 32768 \
    --gpu-memory-utilization 0.15 \
    --host 0.0.0.0 --port 8002
```

`--gpu-memory-utilization 0.15` reserves ~21 GB on GPU 3, leaves TEI the rest.

---

## docker-compose.yml snippet

Minimal diff to apply on top of the existing `docker-compose.yml`. Add these services:

```yaml
services:
  vllm-gemma:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=0,1
      - HF_TOKEN=${HF_TOKEN:-}
    command: >
      --model google/gemma-4-26b-a4b-it
      --served-model-name gemma-4-26b-a4b
      --tensor-parallel-size 2
      --quantization fp8
      --max-model-len 32768
      --gpu-memory-utilization 0.92
      --host 0.0.0.0 --port 8000
    ports: ["8000:8000"]
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface

  vllm-qwen-vl:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=2
    command: >
      --model Qwen/Qwen3-VL-30B-A3B-Instruct-FP8
      --served-model-name qwen3-vl-30b-a3b
      --quantization fp8
      --max-model-len 65536
      --max-num-seqs 32
      --gpu-memory-utilization 0.90
      --limit-mm-per-prompt image=10
      --host 0.0.0.0 --port 8001
    ports: ["8001:8001"]
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface

  tei-embedding:
    image: ghcr.io/huggingface/text-embeddings-inference:latest
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=3
    command: >
      --model-id Qwen/Qwen3-Embedding-8B
      --dtype float16
      --max-batch-tokens 32768
      --max-concurrent-requests 512
      --hostname 0.0.0.0 --port 8080
    ports: ["8080:8080"]
    volumes:
      - ~/.cache/huggingface:/data

  vllm-nuextract:
    image: vllm/vllm-openai:latest
    runtime: nvidia
    environment:
      - CUDA_VISIBLE_DEVICES=3
    command: >
      --model numind/NuExtract-2.0-2B
      --served-model-name nuextract-2b
      --dtype float16
      --max-model-len 32768
      --gpu-memory-utilization 0.15
      --host 0.0.0.0 --port 8002
    ports: ["8002:8002"]
    volumes:
      - ~/.cache/huggingface:/root/.cache/huggingface

  # searxng, postgres, surrealdb, rustfs — use existing service definitions
```

---

## `.env` for the client (fill into the app's `.env`)

```bash
# ─── DATABASE ──────────────────────────────────────────
DATABASE_URL="postgresql://rantai:<password>@postgres:5432/rantai"
SURREAL_DB_URL="ws://surrealdb:8788/rpc"
SURREAL_DB_USER="root"
SURREAL_DB_PASS="<password>"
SURREAL_DB_NAMESPACE="rantai"
SURREAL_DB_DATABASE="knowledge"

# ─── AI / LLM GATEWAY (ON-PREM MODE) ───────────────────
# Leave OPENROUTER_API_KEY blank — on-prem mode skips it entirely.
OPENROUTER_API_KEY=""

# ─── KB pipeline: model ids must match vLLM/TEI --served-model-name ───
KB_EXTRACT_PRIMARY="qwen3-vl-30b-a3b"
KB_EXTRACT_FALLBACK="qwen3-vl-30b-a3b"   # no fallback; primary is the only PDF-capable model on-prem
KB_EMBEDDING_MODEL="Qwen/Qwen3-Embedding-8B"
KB_EMBEDDING_DIM="4096"

# Retrieval behaviour
KB_HYBRID_BM25_ENABLED="true"
KB_RERANK_ENABLED="false"                # enable if quality > latency for client's queries
KB_RERANK_MODEL="gemma-4-26b-a4b"
KB_CONTEXTUAL_RETRIEVAL_ENABLED="false"  # enable after initial ingest is stable
# KB_CONTEXTUAL_RETRIEVAL_MODEL="gemma-4-26b-a4b"
KB_QUERY_EXPANSION_ENABLED="false"
# KB_QUERY_EXPANSION_MODEL="gemma-4-26b-a4b"

# ─── MODE B: ON-PREM endpoint overrides ────────────────
KB_EXTRACT_VISION_BASE_URL="http://vllm-qwen-vl:8001/v1/chat/completions"
KB_EXTRACT_VISION_API_KEY="EMPTY"        # vLLM accepts any non-empty bearer by default
KB_EMBEDDING_BASE_URL="http://tei-embedding:8080/embed"
KB_EMBEDDING_API_KEY="EMPTY"

# ─── Web search: local mode (air-gapped) ───────────────
WEB_SEARCH_MODE="local"
SEARCH_API_URL="http://searxng:8888/search"
# SERPER_API_KEY=""                      # leave unset for fully air-gapped

# ─── S3 storage (RustFS — keep as-is) ──────────────────
S3_ENDPOINT="http://rustfs:9000"
S3_ACCESS_KEY_ID="rustfsadmin"
S3_SECRET_ACCESS_KEY="<secret>"
S3_BUCKET="rantai-files"
S3_REGION="us-east-1"
S3_ENABLE_PATH_STYLE="1"

# ─── Auth ──────────────────────────────────────────────
NEXTAUTH_SECRET="<openssl rand -base64 32>"
NEXTAUTH_URL="https://<client-domain>"

# ─── Assistant defaults ────────────────────────────────
# Chat / reasoning: point per-assistant configs at Gemma via its OpenAI-compatible endpoint.
# (Currently configured in the Settings UI or assistant seed; not a global env var.)
```

Two app-level knobs not yet env-controlled (future work):
1. Main chat endpoint base URL — right now assistant configs assume OpenRouter; for on-prem they need to point at `http://vllm-gemma:8000/v1` (trivial per-assistant setting in the UI).
2. NuExtract document-classification hook — a future Phase 9 addition that uses NuExtract 2B to auto-categorize and sensitivity-tag docs at ingest. Not wired yet.

---

## Verification checklist (client-side smoke test)

After bringing services up, run these to confirm the pipeline works end-to-end:

```bash
# 1. Each model endpoint responds
curl http://vllm-gemma:8000/v1/models | jq .
curl http://vllm-qwen-vl:8001/v1/models | jq .
curl http://tei-embedding:8080/info | jq .
curl http://vllm-nuextract:8002/v1/models | jq .

# 2. Embedding smoke — exact shape the app uses
curl -X POST http://tei-embedding:8080/embed \
  -H "Content-Type: application/json" \
  -d '{"inputs": ["hello world"], "normalize": true}' | jq '.[][0:4]'

# 3. Extraction smoke — send a 1-page PDF
curl -X POST http://vllm-qwen-vl:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer EMPTY" \
  -d '{
    "model": "qwen3-vl-30b-a3b",
    "messages": [{
      "role": "user",
      "content": [
        {"type": "file", "file": {"filename": "test.pdf", "file_data": "data:application/pdf;base64,'"$(base64 -w0 test.pdf)"'"}},
        {"type": "text", "text": "Extract this PDF as Markdown. Headings, tables, math preserved."}
      ]
    }],
    "max_tokens": 2000
  }' | jq -r '.choices[0].message.content' | head -20

# 4. App-side smoke bench (confirms the KB pipeline wiring)
KB_EMBEDDING_BASE_URL="http://tei-embedding:8080/embed" \
  bun run bench:kb:smoke
# Expected: hit@1 >= 0.90, recall@5 >= 0.95, smoke bench PASS

# 5. Ingest a real doc and query it
bun -e 'import("@/lib/rag").then(async({ingestFile, retrieveContext})=>{
  await ingestFile("./test.pdf", "test", "GENERAL", "Test");
  const r = await retrieveContext("main topic", 5);
  console.log(r.chunks.length, "chunks returned");
})'
```

---

## Concurrency expectations

| Metric | Expected | Limit at client's 1200 concurrent target |
|---|---|---|
| Chat p50 latency | 200-500 ms to first token, 15-30 tok/sec/stream | comfortable |
| Chat peak generating concurrency | ~400-500 users actively generating | Gemma 4 on 2× H200 FP8 at `--max-num-seqs 256` handles this with headroom; bump to 384 if queue builds |
| Ingest throughput | ~1 doc / 5 sec per Qwen3-VL instance (single-doc vision extraction) | 5K pages/day = 0.06 pages/sec wall demand — trivial |
| Embedding throughput | ~5000 chunks/sec batched via TEI | covers any burst |
| Query latency (no rerank) | ~80 ms vector + ~15 ms BM25 in parallel + 0 ms fuse = ~100 ms | fast |
| Query latency (with rerank) | +1700 ms for LLM rerank on Gemma | opt-in per-deployment |

### Pressure points to monitor

- **Gemma 4 KV cache (GPU 0-1)** — if concurrent-sequences approaches `--max-num-seqs`, new requests queue. Watch `vllm_num_requests_waiting` metric; bump `--max-num-seqs` or add a 3rd H200 for Gemma if consistently >80% utilized.
- **Qwen3-VL max-mm-per-prompt** — set to 10 in the recipe above (covers Phase 8 segment-split extraction for PDFs up to ~250 pages). Raise if clients upload bigger docs.
- **TEI concurrent embedding requests** — default 512, bump to 1024 if ingest backlog builds.

---

## What's NOT yet wired (Phase 9 candidates)

- **Global chat-LLM base URL env** — right now each assistant's model is configured individually in the Settings UI / seed; we could add `CHAT_DEFAULT_BASE_URL` for easier ops.
- **NuExtract document-classification hook** — ingest currently doesn't call NuExtract for auto-categorization. Phase 9 work: add a classification step after chunk enrichment that produces `{category, sensitivity, confidence}` per doc.
- **Bench-kb smoke against on-prem endpoints** — the bench harness currently hardcodes OpenRouter for the embedder; tiny PR to make it read `KB_EMBEDDING_BASE_URL`.

---

*Captured 2026-04-21. Companion to `KB_VISION_MODEL_BENCHMARKS.md` (which evidence) and `KB_VISION_EXTRACTION_LATENCY.md` (which explains why OpenRouter shared-key serialization does not apply on-prem — self-hosted vLLM gives you your key's full TPM).*
