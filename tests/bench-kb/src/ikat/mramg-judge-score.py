#!/usr/bin/env python3
"""
Merge the blind judge batches and unblind by arm.

Refuses on a missing or duplicated key — a partial judging run scored as if
complete is how a benchmark number silently becomes fiction. Position is the
metric this experiment exists for: the statistical half (docs/15) could not see
WHERE an image landed, only WHICH was chosen.

Usage: python3 src/ikat/mramg-judge-score.py
"""
import json
import glob
import os
import sys
from collections import defaultdict

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..",
                                   "corpus", "results", "endtoend"))

verdicts = {}
for f in sorted(glob.glob(os.path.join(OUT, "judge-verdicts", "batch*.json"))):
    for v in json.load(open(f)):
        if v["key"] in verdicts:
            sys.exit(f"duplicate key {v['key']} in {f}")
        verdicts[v["key"]] = v

key = json.load(open(os.path.join(OUT, "judge-key.json")))
missing = [k for k in key if k not in verdicts]
if missing:
    sys.exit(f"{len(missing)} keys unjudged (e.g. {missing[:5]}) — refusing to score a partial run")

arms = defaultdict(lambda: defaultdict(list))
for k, meta in key.items():
    v = verdicts[k]
    for m in ("relevance", "effectiveness", "position", "comprehensive"):
        if v.get(m) is not None:
            arms[meta["arm"]][m].append(float(v[m]))

print(f"{len(key)} items judged, blind, single judge model\n")
print(f"{'metric':16} {'A: LLM inserts':>15} {'B: IKAT':>10}   scale")
SCALES = {"relevance": "1-5", "effectiveness": "1-5", "position": "0-1", "comprehensive": "1-5"}
result = {}
for m in ("relevance", "effectiveness", "position", "comprehensive"):
    a = arms["A"][m]; b = arms["B"][m]
    ma, mb = sum(a) / len(a), sum(b) / len(b)
    result[m] = {"A": ma, "B": mb, "nA": len(a), "nB": len(b)}
    print(f"{m:16} {ma:15.3f} {mb:10.3f}   {SCALES[m]}")
print(f"\nn per arm (items carrying images): A={result['relevance']['nA']}, B={result['relevance']['nB']}")

with open(os.path.join(OUT, "judge-score.json"), "w") as f:
    json.dump(result, f, indent=1)
print(f"wrote {os.path.join(OUT, 'judge-score.json')}")
