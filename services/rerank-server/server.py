"""Thin HTTP wrapper around nvidia/llama-nemotron-rerank-1b-v2.

Exposes POST /rerank in the Cohere v2 shape so the bench can drop it in
alongside cohere/rerank-4-pro with no protocol changes.

Launch:
    source ~/vllm-env/bin/activate
    CUDA_VISIBLE_DEVICES=1 \
      uvicorn services.rerank_server.server:app --host 0.0.0.0 --port 8200

Env:
    RERANK_MODEL        default "nvidia/llama-nemotron-rerank-1b-v2"
    RERANK_MAX_LENGTH   default 512
    RERANK_BATCH        default 16

Protocol (mirrors POST https://api.cohere.com/v2/rerank):
    POST /rerank
      JSON: { model, query, documents: string[], top_n: number }
    Response:
      200 { results: [{ index: number, relevance_score: number }, ...] }
"""
from __future__ import annotations

import os
import time

import torch
from fastapi import FastAPI
from pydantic import BaseModel
from transformers import AutoModelForSequenceClassification, AutoTokenizer

MODEL_NAME = os.environ.get("RERANK_MODEL", "nvidia/llama-nemotron-rerank-1b-v2")
MAX_LENGTH = int(os.environ.get("RERANK_MAX_LENGTH", "512"))
BATCH = int(os.environ.get("RERANK_BATCH", "16"))
DEVICE = "cuda:0" if torch.cuda.is_available() else "cpu"

print(f"[rerank-server] loading {MODEL_NAME} on {DEVICE} ...", flush=True)
t0 = time.time()

tokenizer = AutoTokenizer.from_pretrained(
    MODEL_NAME, trust_remote_code=True, padding_side="left"
)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token

model = (
    AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME, trust_remote_code=True, torch_dtype=torch.bfloat16
    )
    .eval()
    .to(DEVICE)
)
print(f"[rerank-server] loaded in {time.time() - t0:.1f}s", flush=True)


def prompt_template(query: str, passage: str) -> str:
    return f"question:{query} \n \n passage:{passage}"


def score_pairs(query: str, passages: list[str]) -> list[float]:
    scores: list[float] = []
    for i in range(0, len(passages), BATCH):
        chunk = passages[i : i + BATCH]
        texts = [prompt_template(query, p) for p in chunk]
        batch = tokenizer(
            texts,
            padding=True,
            truncation=True,
            return_tensors="pt",
            max_length=MAX_LENGTH,
        )
        batch = {k: v.to(DEVICE) for k, v in batch.items()}
        with torch.inference_mode():
            logits = model(**batch).logits
        scores.extend(logits.view(-1).float().cpu().tolist())
    return scores


app = FastAPI()


class RerankRequest(BaseModel):
    model: str | None = None
    query: str
    documents: list[str]
    top_n: int | None = None


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_NAME, "device": DEVICE}


@app.post("/rerank")
def rerank(req: RerankRequest) -> dict:
    if not req.documents:
        return {"results": []}
    raw_scores = score_pairs(req.query, req.documents)
    indexed = sorted(
        ({"index": i, "relevance_score": s} for i, s in enumerate(raw_scores)),
        key=lambda r: r["relevance_score"],
        reverse=True,
    )
    if req.top_n:
        indexed = indexed[: req.top_n]
    return {"results": indexed}
