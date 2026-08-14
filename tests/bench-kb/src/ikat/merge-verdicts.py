#!/usr/bin/env python3
"""
Merge per-batch judge verdicts into the label file ppi-eval reads.

Judging was fanned out across agents, each writing verdicts-NNN-MMM.json for its
slice. This joins them back to the manifest, converts 1-based positions into
figure ids, and fails loudly on the two mistakes that would silently corrupt the
estimate:

  - a missing item, which would quietly shrink the unlabelled half
  - a duplicated item, which would let one batch's verdict overwrite another's

Neither would raise an error on its own, and both would change the number.
"""
import glob
import json
import os
import sys

BASE = os.path.join(os.path.dirname(__file__), "..", "..", "corpus", "annotation-scale")
BASE = os.path.abspath(BASE)

man = {m["item"]: m for m in json.load(open(os.path.join(BASE, "manifest.json")))}
seen, verdicts = {}, {}
for f in sorted(glob.glob(os.path.join(BASE, "verdicts-*.json"))):
    if "pilot" in os.path.basename(f):
        continue
    for r in json.load(open(f)):
        i = r["item"]
        if i in seen:
            sys.exit(f"item {i} appears in both {seen[i]} and {os.path.basename(f)} — refusing to guess")
        seen[i] = os.path.basename(f)
        verdicts[i] = r["picked"]

missing = sorted(set(man) - set(verdicts))
if missing:
    sys.exit(f"{len(missing)} items have no verdict: {missing[:20]}{' …' if len(missing) > 20 else ''}")

out = []
for i in sorted(verdicts):
    m = man[i]
    ids = m["shownFigureIds"]
    picked = [ids[p - 1] for p in verdicts[i] if 1 <= p <= len(ids)]
    out.append({
        "questionId": m["questionId"],
        "labelled": m["labelled"],
        "shownFigureIds": ids,
        "picked": picked,
    })

dst = os.path.join(BASE, "judge-labels.json")
json.dump({
    "model": "claude-sonnet (subagent, images read directly)",
    "protocol": "annotator instruction verbatim; 8 candidates; pools reused verbatim where a person annotated",
    "nCandidates": 8,
    "labels": out,
}, open(dst, "w"), indent=2)

pos = sum(len(r["picked"]) for r in out)
print(f"merged {len(out)} items from {len(set(seen.values()))} batches")
print(f"picked {pos} figures; {sum(1 for r in out if not r['picked'])} items got none")
print(f"wrote {dst}")
