#!/usr/bin/env python3
"""
Cheap baselines on MMDocRAG image-quote selection.

A number without a reference class says nothing. Our 568M cross-encoder scores
F1 47.96 here while GPT-4.1 is reported at 80.7, and there are two very different
readings of that:

  - the cross-encoder is doing what a small ranker can do, and the gap is the
    price of reasoning that a frontier LLM has and it does not; or
  - the cross-encoder is worse than methods that cost nothing at all, in which
    case the gap is our problem and not the architecture's.

These baselines separate the two. None of them uses a model, a GPU or a network
call, so whatever they score is the floor any neural ranker must clear.

  random        pick uniformly, matching our emission count
  first         always take the first candidate — a position prior
  bm25          classic lexical retrieval over the benchmark's own descriptions
  longest       take the longest description — a length prior, and a check that
                the task is not accidentally solved by verbosity

Scored exactly as mmdocrag-eval.ts scores: micro precision/recall/F1 over
(question, image) pairs, top-K by score, same K.

Usage:
  python3 src/ikat/mmdocrag-baselines.py [--limit N] [--topk 2]
"""
import argparse
import json
import math
import os
import random
import re
from collections import Counter

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIR = os.environ.get("MMDOCRAG_DIR", os.path.join(BENCH, "corpus", "mmdocrag"))
FILE = os.environ.get("MMDOCRAG_FILE", "dev_15.jsonl")

TOKEN = re.compile(r"[a-z0-9]+")


def tok(s: str):
    return TOKEN.findall(s.lower())


def bm25_scores(query, docs, k1=1.5, b=0.75):
    """Textbook BM25. Corpus is the candidate set of this one question, which is
    the same universe the cross-encoder ranks over — anything else would be
    comparing on different information."""
    toks = [tok(d) for d in docs]
    N = len(toks)
    avgdl = sum(len(t) for t in toks) / max(1, N)
    df = Counter()
    for t in toks:
        for w in set(t):
            df[w] += 1
    out = []
    for t in toks:
        tf = Counter(t)
        dl = len(t)
        s = 0.0
        for w in tok(query):
            if w not in tf:
                continue
            idf = math.log(1 + (N - df[w] + 0.5) / (df[w] + 0.5))
            s += idf * (tf[w] * (k1 + 1)) / (tf[w] + k1 * (1 - b + b * dl / max(1, avgdl)))
        out.append(s)
    return out


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 0.0
    r = tp / (tp + fn) if tp + fn else 0.0
    return 100 * p, 100 * r, (100 * 2 * p * r / (p + r) if p + r else 0.0)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--topk", type=int, default=int(os.environ.get("IKAT_RERANK_TOP_K", 2)))
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(os.path.join(DIR, FILE), encoding="utf-8")]
    if args.limit:
        rows = rows[: args.limit]

    rng = random.Random(20260814)
    methods = ["random", "first", "bm25", "longest"]
    acc = {m: [0, 0, 0] for m in methods}
    n = 0

    for r in rows:
        cands = [q for q in (r.get("img_quotes") or []) if (q.get("img_description") or "").strip()]
        if not cands:
            continue
        gold = {g for g in (r.get("gold_quotes") or []) if g.startswith("image")}
        n += 1
        descs = [c["img_description"] for c in cands]
        ids = [c["quote_id"] for c in cands]

        order = {
            "random": rng.sample(range(len(cands)), len(cands)),
            "first": list(range(len(cands))),
            "bm25": sorted(range(len(cands)), key=lambda i: -bm25_scores(r["question"], descs)[i]),
            "longest": sorted(range(len(cands)), key=lambda i: -len(descs[i])),
        }
        for m in methods:
            picked = {ids[i] for i in order[m][: args.topk]}
            a = acc[m]
            a[0] += len(picked & gold)
            a[1] += len(picked - gold)
            a[2] += len(gold - picked)

    print(f"MMDocRAG {FILE}: {n} questions, top-{args.topk}, no model of any kind\n")
    print(f"{'method':10} {'IP':>7} {'IR':>7} {'IF1':>7}")
    for m in methods:
        p, rc, f = prf(*acc[m])
        print(f"{m:10} {p:7.2f} {rc:7.2f} {f:7.2f}")
    print(f"\n{'cross-encoder 568M':10} — see mmdocrag-selection.json")
    print("GPT-4.1, reported by the benchmark's authors: image-quote F1 80.7")


if __name__ == "__main__":
    main()
