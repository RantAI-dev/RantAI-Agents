#!/usr/bin/env python3
"""
Admission rules over the persisted score dump — arithmetic, no model.

The question under study. Selection has two decisions: how to ORDER candidates
(the cross-encoder's job) and how many to ADMIT (a rule's job). Ours admits by
an absolute floor, score >= 0.1, and the floor is the largest identified loss:
the same frozen configuration scores 11.31 on MMDocRAG News with the floor and
74.03 without it. An absolute cut on a sigmoid score assumes the score
distribution is the same in every corpus, and it is not — description style
shifts it wholesale.

The candidate fix is admission RELATIVE to the question's own distribution:
admit candidates scoring at least alpha * max(scores of this question). That is
scale-free by construction, so if the failure really is distribution shift, one
alpha should transfer where no absolute floor does.

Method-hygiene note, stated where the numbers are made: every rule here is
evaluated on the full grid across ALL evaluation units at once, and the file
reports the whole surface. Nothing is selected per benchmark. The claim a rule
can earn is not "best somewhere" but "never collapses anywhere" — the statistic
that matters is the worst unit and the macro average, not any single win.

Usage:
  python3 src/ikat/admission-rules.py [--dump corpus/results/score-dump.jsonl]
"""
import argparse
import json
import os
from collections import defaultdict

BENCH = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

# The units the literature reports on: MRAMG pools subsets into domains.
MRAMG_DOMAIN = {
    "arxiv": "MRAMG/Academic",
    "recipe": "MRAMG/Lifestyle", "manual": "MRAMG/Lifestyle",
    "wit": "MRAMG/Web", "wiki": "MRAMG/Web", "web": "MRAMG/Web",
}


def unit_of(row):
    if row["bench"] == "mramg":
        return MRAMG_DOMAIN[row["subset"]]
    return f"MMDoc/{row['subset']}"


def admit(scores, rule, p):
    """Return indices admitted (ordering is by score desc, ties by index)."""
    order = sorted(range(len(scores)), key=lambda i: (-scores[i], i))
    m = scores[order[0]] if order else 0.0
    if rule == "abs":          # score >= t, top-K
        keep = [i for i in order if scores[i] >= p["t"]]
    elif rule == "topk":       # no threshold at all
        keep = order
    elif rule == "rel":        # score >= alpha * max, top-K — scale-free
        keep = [i for i in order if scores[i] >= p["a"] * m]
    elif rule == "relguard":   # rel, but silent when even the best is hopeless
        keep = [] if m < p["t"] else [i for i in order if scores[i] >= p["a"] * m]
    else:
        raise ValueError(rule)
    return keep[: p.get("K", 2)]


def score_rule(rows, rule, p):
    per_unit = defaultdict(lambda: [0, 0, 0, 0, 0])  # tp fp fn n silent
    for r in rows:
        u = unit_of(r)
        gold = set(r["gold"])
        scores = [c["score"] for c in r["cands"]]
        ids = [c["id"] for c in r["cands"]]
        # LIST-based counting, exactly as the eval scripts (and MRAMG's metric)
        # count: a candidate id can occur twice among a document's images, and an
        # emitted duplicate scores per emission. Deduplicating here produced
        # tp=87 where the published-comparable eval counts tp=94.
        picked = [ids[i] for i in admit(scores, rule, p)]
        a = per_unit[u]
        a[0] += sum(1 for i in picked if i in gold)
        a[1] += sum(1 for i in picked if i not in gold)
        a[2] += sum(1 for g in gold if g not in picked)
        a[3] += 1
        a[4] += not picked
    out = {}
    for u, (tp, fp, fn, n, silent) in per_unit.items():
        P = tp / (tp + fp) if tp + fp else 0.0
        R = tp / (tp + fn) if tp + fn else 0.0
        F = 200 * P * R / (P + R) if P + R else 0.0
        out[u] = {"P": 100 * P, "R": 100 * R, "F": F, "n": n, "silent": 100 * silent / n}
    return out


def fmt(units, res):
    return "  ".join(f"{res[u]['F']:6.2f}" for u in units)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dump", default=os.path.join(BENCH, "corpus", "results", "score-dump.jsonl"))
    ap.add_argument("--out", default=os.path.join(BENCH, "corpus", "results", "admission-rules.json"))
    args = ap.parse_args()

    rows = [json.loads(l) for l in open(args.dump, encoding="utf-8") if l.strip()]
    units = sorted({unit_of(r) for r in rows})
    print(f"{len(rows)} questions across {len(units)} evaluation units\n")
    print("F1 by unit; last two columns are the transfer statistics.\n")
    header = "  ".join(f"{u.split('/')[-1][:6]:>6}" for u in units)
    print(f"{'rule':28} {header}   macro   worst")

    results = {}

    def report(name, rule, p):
        res = score_rule(rows, rule, p)
        macro = sum(res[u]["F"] for u in units) / len(units)
        worst = min(res[u]["F"] for u in units)
        print(f"{name:28} {fmt(units, res)}  {macro:6.2f}  {worst:6.2f}")
        results[name] = {"rule": rule, "params": p, "units": res, "macro": macro, "worst": worst}

    # The deployed configuration and its obvious neighbours.
    report("abs t=0.1 K=2 (deployed)", "abs", {"t": 0.1, "K": 2})
    report("abs t=0.001 K=2 (prod fix)", "abs", {"t": 0.001, "K": 2})
    report("topk K=1", "topk", {"K": 1})
    report("topk K=2", "topk", {"K": 2})
    report("topk K=3", "topk", {"K": 3})
    print()

    # The full relative-admission surface. Reported whole; nothing chosen per unit.
    for K in (2, 3, 4):
        for a in (0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9):
            report(f"rel a={a} K={K}", "rel", {"a": a, "K": K})
        print()

    # A weak silence guard on top of the best-principled shape, swept too.
    for t in (0.001, 0.01, 0.05):
        for a in (0.4, 0.5, 0.6):
            report(f"relguard a={a} t={t} K=2", "relguard", {"a": a, "t": t, "K": 2})
    print()

    with open(args.out, "w") as f:
        json.dump(results, f, indent=1)
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
