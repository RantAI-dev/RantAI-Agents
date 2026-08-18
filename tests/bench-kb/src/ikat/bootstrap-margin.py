#!/usr/bin/env python3
"""
Bootstrap interval for the MRAMG Academic margin.

The paper quotes Image Precision 69.12 against GPT-4o's published 65.28. A
+3.84 margin on 200 questions is exactly the kind of number a reviewer asks to
see bounded, and the comparator is a point estimate we cannot resample — their
per-question outcomes are not published. So the honest interval is one-sided:
resample OUR questions, report the distribution of our pooled precision, and
state how often it falls at or below the published comparator. That answers
"could our number be above theirs by sampling luck alone" for the only side of
the comparison we have data for.

Pooled precision is resampled at the QUESTION level (tp and emitted travel
together), because images within a question are not independent.

Usage:
  python3 src/ikat/bootstrap-margin.py [--unit MRAMG/Academic] [--comparator 65.28]
"""
import argparse
import json
import os
import random
from collections import defaultdict

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MRAMG_DOMAIN = {
    "arxiv": "MRAMG/Academic",
    "recipe": "MRAMG/Lifestyle", "manual": "MRAMG/Lifestyle",
    "wit": "MRAMG/Web", "wiki": "MRAMG/Web", "web": "MRAMG/Web",
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", default=os.path.join(BENCH, "corpus", "results", "score-dump.jsonl"))
    ap.add_argument("--unit", default="MRAMG/Academic")
    ap.add_argument("--comparator", type=float, default=65.28)
    ap.add_argument("--t", type=float, default=0.1, help="deployed absolute floor")
    ap.add_argument("--K", type=int, default=2)
    ap.add_argument("--B", type=int, default=20000)
    args = ap.parse_args()

    perq = []  # (tp, emitted) per question of the chosen unit, deployed rule
    for line in open(args.dump, encoding="utf-8"):
        r = json.loads(line)
        unit = (MRAMG_DOMAIN[r["subset"]] if r["bench"] == "mramg" else f"MMDoc/{r['subset']}")
        if unit != args.unit:
            continue
        gold = set(r["gold"])
        order = sorted(r["cands"], key=lambda c: -c["score"])
        picked = [c["id"] for c in order if c["score"] >= args.t][: args.K]
        perq.append((sum(p in gold for p in picked), len(picked)))

    n = len(perq)
    tp = sum(q[0] for q in perq)
    em = sum(q[1] for q in perq)
    point = 100 * tp / em if em else 0.0
    print(f"{args.unit}: {n} questions, pooled IP = {point:.2f} (deployed rule t={args.t} K={args.K})")

    rng = random.Random(20260818)
    draws = []
    below = 0
    for _ in range(args.B):
        t = e = 0
        for _ in range(n):
            q = perq[rng.randrange(n)]
            t += q[0]
            e += q[1]
        p = 100 * t / e if e else 0.0
        draws.append(p)
        below += p <= args.comparator
    draws.sort()
    lo, hi = draws[int(0.025 * args.B)], draws[int(0.975 * args.B)]
    print(f"bootstrap over questions, B={args.B}: 95% CI [{lo:.2f}, {hi:.2f}]")
    print(f"share of resamples at or below the published {args.comparator}: "
          f"{100 * below / args.B:.2f}%")
    print("\nOne-sided by necessity: the comparator is a published point estimate;")
    print("its own sampling error cannot be resampled from here.")


if __name__ == "__main__":
    main()
